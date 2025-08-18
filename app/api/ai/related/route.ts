import {
    generateEmbedding,
    prepareEmbeddingForTurso,
    parseEmbeddingFromTurso,
    calculateCosineSimilarity,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";
import { callAI, AIServiceError } from "../../../../src/services/aiService";
import type { ChatMessage } from "../../../../src/services/types";
import { db, client } from "../../../../src/db";
import * as schema from "../../../../src/db/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";

const TOP_K = 10; // Maximum related memos to return
const SIMILARITY_THRESHOLD = 0.3; // 降低阈值，让更多笔记参与AI分析
const AI_ANALYSIS_LIMIT = 5; // 限制传给AI分析的笔记数量，减少以提高成功率

console.log("🔧 AI Related Memos Route initialized");

/**
 * Gets or generates an embedding for a given memo.
 * It prioritizes using a valid, existing embedding. If not available,
 * it generates a new one and saves it to the database asynchronously.
 */
async function getMemoEmbedding(memoId: string): Promise<number[]> {
    try {
        const [existingMemo] = await db
            .select({
                content: schema.memos.content,
                embedding: schema.memos.embedding
            })
            .from(schema.memos)
            .where(and(
                eq(schema.memos.id, memoId),
                isNull(schema.memos.deletedAt)
            ));

        if (!existingMemo) {
            throw new Error("Memo not found or deleted");
        }

        const content = existingMemo.content;
        const existingEmbedding = existingMemo.embedding;

        // Try to use existing embedding if valid
        if (existingEmbedding && (existingEmbedding as any).length > 0) {
            try {
                const embeddingArray = parseEmbeddingFromTurso(existingEmbedding);
                if (embeddingArray.length === 2560) { // Simple validation
                    return embeddingArray;
                }
                console.warn(`⚠️ Existing embedding for memo ${memoId} has incorrect length, regenerating...`);
            } catch (e) {
                console.warn(`⚠️ Failed to parse existing embedding for memo ${memoId}, regenerating...`);
            }
        }

        // Generate new embedding if needed
        if (!content || content.trim().length === 0) {
            throw new Error("Memo content is empty, cannot generate embedding");
        }

        console.log(`🔄 Generating new embedding for memo ${memoId}`);
        const newEmbedding = await generateEmbedding(content);

        // Asynchronously save the new embedding without blocking the response
        const embeddingForTurso = prepareEmbeddingForTurso(newEmbedding);
        db
            .update(schema.memos)
            .set({ embedding: embeddingForTurso })
            .where(eq(schema.memos.id, memoId))
            .catch(saveError => {
                console.warn(`⚠️ Failed to save new embedding for memo ${memoId} in background:`, saveError);
            });

        return newEmbedding;

    } catch (error: any) {
        console.error(`❌ Error in getMemoEmbedding for ${memoId}:`, error);
        // Re-throw to be caught by the main API handler
        throw error;
    }
}

/**
 * 使用AI分析和重新排序相关笔记
 */
async function analyzeRelatedMemosWithAI(
    currentMemoContent: string, 
    candidateMemos: any[]
): Promise<any[]> {
    console.log(`🤖 AI analyzing ${candidateMemos.length} candidate memos...`);

    try {
        // 构建AI分析prompt
        const memosForAnalysis = candidateMemos.slice(0, AI_ANALYSIS_LIMIT);
        const memosText = memosForAnalysis.map((memo, index) => 
            `${index + 1}. [ID: ${memo.id}] ${memo.content.substring(0, 200)}${memo.content.length > 200 ? '...' : ''}`
        ).join('\n\n');

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `你是一个智能笔记分析助手。你的任务是分析当前笔记与候选笔记之间的相关性，并按相关性从高到低排序。

分析要考虑的因素：
1. 主题相关性 - 是否讨论相同或相关的主题
2. 语义相关性 - 概念、想法的关联
3. 情境相关性 - 时间、地点、情境的关联
4. 实用相关性 - 对理解当前笔记是否有帮助

请返回JSON格式，包含每个笔记的分析：
{
  "analysis": [
    {
      "id": "笔记ID",
      "relevanceScore": 相关性评分(0-1),
      "reason": "相关性原因简述",
      "topics": ["相关主题1", "相关主题2"]
    }
  ]
}`
            },
            {
                role: 'user',
                content: `当前笔记内容：
${currentMemoContent}

候选相关笔记：
${memosText}

请分析这些候选笔记与当前笔记的相关性，并返回分析结果。`
            }
        ];

        const aiResponse = await callAI({
            messages,
            temperature: 0.3,
        });

        // 解析AI响应
        const analysisResult = JSON.parse(aiResponse.content);
        console.log(`🎯 AI analysis completed for ${analysisResult.analysis?.length || 0} memos`);

        // 将AI分析结果与原始数据合并
        const enhancedMemos = memosForAnalysis.map(memo => {
            const aiAnalysis = analysisResult.analysis?.find((a: any) => a.id === memo.id);
            return {
                ...memo,
                ai_relevance_score: aiAnalysis?.relevanceScore || 0,
                ai_reason: aiAnalysis?.reason || '未分析',
                ai_topics: aiAnalysis?.topics || [],
                // 综合评分：向量相似度 * 0.4 + AI相关性 * 0.6
                combined_score: (memo.similarity_score || 0) * 0.4 + (aiAnalysis?.relevanceScore || 0) * 0.6
            };
        });

        // 按综合评分排序并返回
        return enhancedMemos
            .filter(memo => memo.combined_score > 0.2) // 过滤低分笔记
            .sort((a, b) => b.combined_score - a.combined_score)
            .slice(0, TOP_K);

    } catch (error: any) {
        console.error("❌ AI analysis failed:", error);
        // AI分析失败时，回退到基础向量相似度排序
        console.log("🔄 Falling back to vector similarity only...");
        return candidateMemos
            .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
            .slice(0, TOP_K);
    }
}

/**
 * Performs vector similarity search to find related memos, filtering by a similarity threshold.
 */
async function findRelatedMemos(memoId: string, queryEmbedding: number[]): Promise<any[]> {
    console.log("🔍 Searching for related memos using vector similarity...");

    try {
        // Get all memos with embeddings (excluding the current memo)
        const candidateMemos = await db
            .select({
                id: schema.memos.id,
                content: schema.memos.content,
                created_at: schema.memos.createdAt,
                updated_at: schema.memos.updatedAt,
                embedding: schema.memos.embedding
            })
            .from(schema.memos)
            .where(and(
                ne(schema.memos.id, memoId),
                isNull(schema.memos.deletedAt)
            ));


        // Calculate similarity scores and filter by threshold
        const memosWithScores = candidateMemos
            .map(memo => {
                if (!memo.embedding) {
                    return null; // Skip memos without embeddings
                }

                try {
                    const memoEmbedding = parseEmbeddingFromTurso(memo.embedding);
                    const similarity = calculateCosineSimilarity(queryEmbedding, memoEmbedding);
                    
                    return {
                        ...memo,
                        similarity_score: similarity
                    };
                } catch (error) {
                    console.warn(`⚠️ Failed to parse embedding for memo ${memo.id}, skipping...`, error);
                    return null;
                }
            })
            .filter((memo): memo is NonNullable<typeof memo> => memo !== null)
            .filter(memo => memo.similarity_score >= SIMILARITY_THRESHOLD)
            .sort((a, b) => b.similarity_score - a.similarity_score) // Sort by similarity desc
            .slice(0, TOP_K);

        return memosWithScores;

    } catch (error: any) {
        console.error("❌ Related memos search failed:", error);
        throw new Error(`Related memos search failed: ${error.message}`);
    }
}

// Main API handler for the POST request
export async function POST(req: Request) {
    const startTime = Date.now();
    let memoId: string | undefined;

    try {
        const body = await req.json();
        memoId = body.memoId;

        if (!memoId || typeof memoId !== 'string') {
            return new Response(JSON.stringify({ error: "memoId is required" }), { status: 400 });
        }

        console.log(`\n🚀 Related Memos API called for memo ID: ${memoId}`);

        // 1. Get memo embedding and content
        const [currentMemo] = await db
            .select({
                content: schema.memos.content,
                embedding: schema.memos.embedding
            })
            .from(schema.memos)
            .where(and(
                eq(schema.memos.id, memoId),
                isNull(schema.memos.deletedAt)
            ));

        if (!currentMemo) {
            throw new Error("Memo not found or deleted");
        }

        const embedding = await getMemoEmbedding(memoId);

        // 2. Find candidate memos using vector similarity
        const candidateMemos = await findRelatedMemos(memoId, embedding);

        // 3. Use AI to analyze and rerank the related memos
        const aiAnalyzedMemos = await analyzeRelatedMemosWithAI(currentMemo.content, candidateMemos);

        // 4. Format the response
        const formattedMemos = aiAnalyzedMemos.map((row: any) => ({
            id: String(row.id),
            content: String(row.content),
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
            similarity_score: Number(row.similarity_score || 0),
            ai_relevance_score: Number(row.ai_relevance_score || 0),
            combined_score: Number(row.combined_score || 0),
            ai_reason: String(row.ai_reason || ''),
            ai_topics: row.ai_topics || []
        }));

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Found ${aiAnalyzedMemos.length} AI-analyzed related memos in ${duration.toFixed(2)}s.`);

        return new Response(JSON.stringify({
            relatedMemos: formattedMemos,
            count: formattedMemos.length,
            processingTime: duration,
            analysisMethod: "vector_similarity_with_ai"
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        const memoInfo = memoId ? `for memo ${memoId}` : "";

        if (error instanceof EmbeddingServiceError) {
            console.error(`\n❌ Embedding Service Error after ${duration.toFixed(2)}s ${memoInfo}:`, error.code, error.message);
        } else {
            console.error(`\n❌ Related memos search failed after ${duration.toFixed(2)}s ${memoInfo}:`, error.message);
        }

        return new Response(JSON.stringify({
            error: error.message || "查找相关笔记时发生未知错误",
            processingTime: duration
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}