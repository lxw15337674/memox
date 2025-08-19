import {
    generateEmbedding,
    prepareEmbeddingForTurso,
    parseEmbeddingFromTurso,
    calculateCosineSimilarity,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";
import { callAI } from "../../../../src/services/aiService";
import type { ChatMessage } from "../../../../src/services/types";
import { db } from "../../../../src/db";
import * as schema from "../../../../src/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";

const TOP_K = 20; // Maximum related memos to return
const VECTOR_SIMILARITY_THRESHOLD = 0.4; // 向量相似度阈值
const MAX_AI_CANDIDATES = 30; // 向量预筛选后送给AI分析的最大候选数量

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
            } catch (e) {
                // Silently regenerate if parsing fails
            }
        }

        // Generate new embedding if needed
        if (!content || content.trim().length === 0) {
            throw new Error("Memo content is empty, cannot generate embedding");
        }

        const newEmbedding = await generateEmbedding(content);

        // Asynchronously save the new embedding without blocking the response
        const embeddingForTurso = prepareEmbeddingForTurso(newEmbedding);
        db
            .update(schema.memos)
            .set({ embedding: embeddingForTurso })
            .where(eq(schema.memos.id, memoId))
            .catch(() => {
                // Silently handle save errors
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

    try {
        // 构建AI分析prompt - 使用所有向量预筛选的候选
        const memosForAnalysis = candidateMemos; // 不再额外限制，相信向量预筛选的质量
        const memosText = memosForAnalysis.map((memo, index) => 
            `${index + 1}. [ID: ${memo.id}] ${memo.content}`
        ).join('\n\n');

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `你是专业的笔记关联分析专家。你的任务是精确分析当前笔记与候选笔记之间的语义相关性。

## 评分标准（严格执行）：
- **0.9-1.0**：极高相关 - 同一主题的不同角度、直接延续或补充关系
- **0.7-0.9**：高度相关 - 相同领域的不同方面、概念有明显关联
- **0.5-0.7**：中等相关 - 相似主题但角度不同、间接相关
- **0.3-0.5**：弱相关 - 仅有部分概念重叠、背景相关
- **0.1-0.3**：极弱相关 - 微弱的概念联系
- **0.0-0.1**：无关 - 完全不同的主题和内容

## 分析重点：
1. **核心主题匹配**：两个笔记是否讨论相同或密切相关的主题
2. **概念层面关联**：涉及的概念、理论、方法是否有关联
3. **逻辑关系**：是否存在因果、对比、补充等逻辑关系
4. **实用价值**：对理解当前笔记是否有直接帮助
5. **语义深度**：不仅看关键词，更要理解深层含义

## 输出要求：
- 必须返回有效的JSON格式
- 每个笔记都必须给出评分
- 评分要准确反映真实的相关程度
- 宁可评分保守，也不要虚高

请返回JSON格式：
{
  "analysis": [
    {
      "id": "笔记ID",
      "relevanceScore": 相关性评分(0-1的小数),
    }
  ]
}`
            },
            {
                role: 'user',
                content: `## 当前笔记内容：
${currentMemoContent}

## 候选相关笔记：
${memosText}

请仔细分析每个候选笔记与当前笔记的相关性，基于内容的深层语义而非表面关键词。给出精确的相关性评分并返回JSON结果。`
            }
        ];

        const aiResponse = await callAI({
            messages,
            temperature: 0.3,
        });

        // 解析AI响应
        const analysisResult = JSON.parse(aiResponse.content);
        console.log(analysisResult)
        // 将AI分析结果与原始数据合并
        const enhancedMemos = memosForAnalysis.map(memo => {
            const aiAnalysis = analysisResult.analysis?.find((a: any) => a.id === memo.id);
            return {
                ...memo,
                aiRelevanceScore: aiAnalysis?.relevanceScore || 0
            };
        });

        // 按AI相关性评分排序并返回
        return enhancedMemos
            .filter(memo => memo.aiRelevanceScore > 0.4) // 过滤低分笔记
            .sort((a, b) => b.aiRelevanceScore - a.aiRelevanceScore)
            .slice(0, TOP_K);
    } catch (error: any) {
        // AI分析失败时，回退到按时间排序
        return candidateMemos
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, TOP_K);
    }
}

/**
 * 使用向量相似度查找候选笔记，为AI分析提供高质量的候选集
 */
async function findRelatedMemos(memoId: string, queryEmbedding: number[]): Promise<any[]> {

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
                        vectorSimilarity: similarity
                    };
                } catch (error) {
                    return null;
                }
            })
            .filter((memo): memo is NonNullable<typeof memo> => memo !== null)
            .filter(memo => memo.vectorSimilarity >= VECTOR_SIMILARITY_THRESHOLD)
            .sort((a, b) => b.vectorSimilarity - a.vectorSimilarity) // 按相似度降序排序
            .slice(0, MAX_AI_CANDIDATES); // 限制AI分析的候选数量，平衡准确性和性能

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
            aiRelevanceScore: Number(row.aiRelevanceScore || 0)
        }));

        const duration = (Date.now() - startTime) / 1000;

        return new Response(JSON.stringify({
            relatedMemos: formattedMemos,
            count: formattedMemos.length,
            processingTime: duration,
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