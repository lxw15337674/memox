import { db, client } from "../../../../src/db";
import * as schema from "../../../../src/db/schema";
import { sql } from "drizzle-orm";
import {
    generateEmbedding,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";
import {
    callAI,
    AIServiceError
} from "../../../../src/services/aiService";
const TOP_K = 30; // Retrieve top 30 candidate memos for AI analysis
const DISTANCE_THRESHOLD = 0.8; // More relaxed threshold for initial vector filtering

/**
 * Wrapper function for generating embeddings using the embedding service
 */
async function getEmbedding(text: string): Promise<number[]> {
    try {
        const embedding = await generateEmbedding(text);
        return embedding;
    } catch (error: any) {
        if (error instanceof EmbeddingServiceError) {
            console.error("❌ Embedding Service Error:", error.code, error.message);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        } else {
            console.error("❌ Error generating embedding:", error.message);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }
}

/**
 * Performs vector similarity search in Turso database using hybrid approach with new schema
 */
async function performVectorSearch(queryVectorBuffer: Buffer): Promise<any[]> {
    try {
        
        // 将Buffer转换为数组格式，以便在SQL中使用vector32()函数
        const queryArray = Array.from(new Float32Array(queryVectorBuffer.buffer));
        const vectorString = JSON.stringify(queryArray);
        
        // 使用原始 SQL 执行向量搜索，配合新的 vector32() 函数
        const vectorSearchSQL = `
            SELECT 
                id,
                content,
                created_at,
                updated_at,
                vector_distance_cos(embedding, vector32(?)) as distance
            FROM memos 
            WHERE 
                deleted_at IS NULL 
                AND embedding IS NOT NULL
                AND vector_distance_cos(embedding, vector32(?)) < ?
            ORDER BY distance ASC
            LIMIT ?
        `;
        
        // 执行向量搜索查询
        const result = await client.execute({
            sql: vectorSearchSQL,
            args: [vectorString, vectorString, DISTANCE_THRESHOLD, TOP_K]
        });
        
        // 转换结果格式
        const searchResults = result.rows.map(row => ({
            id: row[0] as string,
            content: row[1] as string,
            created_at: row[2] as string,
            updated_at: row[3] as string,
            distance: row[4] as number,
            similarity_score: 1 - (row[4] as number) // 转换为相似度 (1 - cosine_distance)
        }));
        
        // 由于已在SQL层过滤，直接返回结果
        return searchResults;
        
    } catch (error: any) {
        console.error("❌ Vector search failed, falling back to simple search:", error);
        
        // 如果向量搜索失败，回退到简单搜索
        try {
            const searchResult = await db
                .select({
                    id: schema.memos.id,
                    content: schema.memos.content,
                    created_at: schema.memos.createdAt,
                    updated_at: schema.memos.updatedAt
                })
                .from(schema.memos)
                .where(sql`${schema.memos.deletedAt} IS NULL`)
                .orderBy(sql`${schema.memos.createdAt} DESC`)
                .limit(TOP_K);

            return searchResult.map(memo => ({
                ...memo,
                similarity_score: 0.5 // 占位符相似度分数
            }));
        } catch (fallbackError: any) {
            console.error("❌ Fallback search also failed:", fallbackError);
            throw new Error(`Search failed: ${error.message}`);
        }
    }
}

// Main API handler for the POST request
export async function POST(req: Request) {
    const startTime = Date.now();
    let query: string | undefined;

    try {
        const body = await req.json();
        query = body.query;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            console.log("❌ Invalid query received:", query);
            return new Response(JSON.stringify({
                error: "Query is required and must be a non-empty string"
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const trimmedQuery = query.trim();

        // 1. Vectorize the user's query
        const queryEmbedding = await getEmbedding(trimmedQuery);
        const queryVectorBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);

        // 2. Perform vector similarity search
        const searchResults = await performVectorSearch(queryVectorBuffer);

        if (searchResults.length === 0) {
            const duration = (Date.now() - startTime) / 1000;
            return new Response(JSON.stringify({
                answer: "🤔 我仔细翻找了你的笔记库，但没有发现与这个问题直接相关的内容。\n\n**建议尝试：**\n- 换个角度重新描述问题\n- 使用更具体或更宽泛的关键词\n- 确认相关内容是否已经记录在笔记中\n\n也许你可以先记录一些相关想法，让我下次能更好地帮助你！",
                resultsCount: 0,
                sources: []
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Prepare sources with metadata for frontend display
        const sources = searchResults.map(row => ({
            id: String(row.id),
            content: String(row.content),
            similarity: row.similarity_score ? parseFloat(String(row.similarity_score)) : null,
            preview: String(row.content).substring(0, 150) + (String(row.content).length > 150 ? "..." : ""),
            createdAt: row.created_at ? String(row.created_at) : null,
            updatedAt: row.updated_at ? String(row.updated_at) : null,
            // Format date for display
            displayDate: row.created_at ? new Date(String(row.created_at)).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : '未知日期'
        }));

        // If no sources meet the similarity threshold, return early
        if (sources.length === 0) {
            const duration = (Date.now() - startTime) / 1000;
            return new Response(JSON.stringify({
                answer: "🔍 我找到了一些笔记内容，但它们与你的问题关联度不够高（相似度<50%）。\n\n**为了获得更精准的结果，建议：**\n- 尝试使用更具体的描述或关键词\n- 换个角度重新组织问题\n- 检查是否有相关笔记使用了不同的表达方式\n\n你的问题很有价值，也许可以先记录一些相关思考，帮助我未来更好地理解你的需求！",
                resultsCount: 0,
                sources: []
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Use filtered sources for context generation
        const candidatesForAI = sources.map((source, index) => 
            `[${index + 1}] ID: ${source.id}\n内容: ${source.content}\n创建时间: ${source.displayDate}\n---`
        ).join('\n\n');

        // 3. Build the prompt for AI analysis and scoring
        const rolePrompt = `
        你是一个智能的笔记助手。你需要完成两个任务：1) 分析笔记与查询的相关性并评分；2) 基于相关的笔记生成回答。

        ## 用户查询
        ${trimmedQuery}

        ## 候选笔记内容
        ${candidatesForAI}

        ## 任务要求

        ### 第一步：相关性分析和评分
        为每个候选笔记评估与查询的相关性，评分标准：
        - **0.9-1.0**: 直接回答查询问题，高度相关
        - **0.7-0.9**: 与查询主题密切相关，有重要参考价值  
        - **0.5-0.7**: 与查询有一定关联，可作为补充信息
        - **0.3-0.5**: 间接相关，背景信息
        - **0.0-0.3**: 基本无关或关联度极低

        ### 第二步：生成智能回答
        基于我的笔记内容，为用户提供有深度、有启发的回答，不要自我发散，回答控制在200字以内。

        ## 输出格式要求
        请严格按照以下JSON格式返回：
        {
          "relevanceScores": [
            {
              "id": "笔记ID",
              "score": 相关性评分(0-1)
            }
          ],
          "answer": "基于最相关笔记生成的智能回答",
          "selectedSources": ["最相关的笔记ID列表"]
        }

        ## 回答指引
        1. **准确评分**: 严格按照相关性标准评分，不要过于宽松
        2. **核心回答**: 直接回应用户的问题
        3. **整合信息**: 将最相关的笔记内容整合成连贯的叙述
        4. **引用佐证**: 可以引用具体的笔记片段支持观点
        5. **启发性**: 以温暖、启发性的语气回应

        现在请开始分析和回答。
        `;

        // 4. Generate the answer using AI API
        const response = await callAI({
            messages: [
                { role: 'system', content: rolePrompt },
                { role: 'user', content: trimmedQuery }
            ],
            temperature: 0.5,
            maxTokens: 1500
        });

        // Parse the JSON response from AI
        let answer = '';
        let aiScoredSources: any[] = [];
        
        try {
            const jsonResponse = JSON.parse(response.content);
            answer = jsonResponse.answer;
            
            if (!answer) {
                throw new Error("AI response JSON does not contain 'answer' field.");
            }

            // Process AI relevance scores and update sources
            if (jsonResponse.relevanceScores && Array.isArray(jsonResponse.relevanceScores)) {
                const scoreMap = new Map();
                jsonResponse.relevanceScores.forEach((score: any) => {
                    scoreMap.set(score.id, {
                        aiScore: score.score
                    });
                });

                // Update sources with AI scores and filter by relevance
                aiScoredSources = sources
                    .map(source => ({
                        ...source,
                        aiRelevanceScore: scoreMap.get(source.id)?.aiScore || 0,
                        // Replace vector similarity with AI score as primary metric
                        similarity: scoreMap.get(source.id)?.aiScore || source.similarity
                    }))
                    .filter(source => source.aiRelevanceScore >= 0.3) // Filter by AI score threshold
                    .sort((a, b) => b.aiRelevanceScore - a.aiRelevanceScore); // Sort by AI relevance
            } else {
                // Fallback to original sources if AI scoring fails
                aiScoredSources = sources;
            }
            
        } catch (e: any) {
            console.error("❌ Failed to parse AI JSON response:", e.message);
            // Fallback to using the raw content if parsing fails
            answer = response.content;
            aiScoredSources = sources;
        }

        const duration = (Date.now() - startTime) / 1000;

        // 5. Return the complete response as JSON
        return new Response(JSON.stringify({
            answer,
            resultsCount: aiScoredSources.length,
            processingTime: duration,
            sources: aiScoredSources
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        const queryInfo = query ? `for query "${query.substring(0, 50)}..."` : "";

        if (error instanceof AIServiceError) {
            console.error(`\n❌ AI Service Error after ${duration.toFixed(2)}s ${queryInfo}:`, error.code, error.message);
        } else if (error instanceof EmbeddingServiceError) {
            console.error(`\n❌ Embedding Service Error after ${duration.toFixed(2)}s ${queryInfo}:`, error.code, error.message);
        } else {
            console.error(`\n❌ AI Search failed after ${duration.toFixed(2)}s ${queryInfo}:`, error.message);
        }

        return new Response(JSON.stringify({
            error: error.message || "An unknown error occurred",
            processingTime: duration
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}