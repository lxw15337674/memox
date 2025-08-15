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
const TOP_K = 30; // Retrieve top 30 most similar memos
const SIMILARITY_THRESHOLD = 0.4; // Cosine distance threshold, lower is more similar (0.4 -> 60% similarity)

console.log("🔧 AI Search Route initialized with config:");
console.log("- TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✅ Set" : "❌ Missing");
console.log("- SILICONFLOW_API_KEY:", process.env.SILICONFLOW_API_KEY ? "✅ Set" : "❌ Missing");

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
 * Performs vector similarity search in Turso database
 */
async function performVectorSearch(queryVectorBuffer: Buffer): Promise<any[]> {
    console.log("🔍 Performing simple search (vector search disabled)...");

    try {
        // Simple search - return recent memos since vector search is not available
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
            similarity_score: 0.5 // Placeholder similarity score
        }));

    } catch (error: any) {
        console.error("❌ Search failed:", error);
        throw new Error(`Search failed: ${error.message}`);
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
        console.log(`\n🚀 AI Search started for query: "${trimmedQuery.substring(0, 50)}..."`);

        // 1. Vectorize the user's query
        const queryEmbedding = await getEmbedding(trimmedQuery);
        const queryVectorBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);

        // 2. Perform vector similarity search
        const searchResults = await performVectorSearch(queryVectorBuffer);

        if (searchResults.length === 0) {
            const duration = (Date.now() - startTime) / 1000;
            console.log(`⚠️ No search results found. Responded in ${duration.toFixed(2)}s.`);
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
            console.log(`⚠️ No relevant sources found. Responded in ${duration.toFixed(2)}s.`);
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
        const context = sources.map(source => source.content).join("\n\n---\n\n");
        console.log(`📊 Found ${sources.length} sources. Generating AI answer...`);

        // 3. Build the prompt for the language model
        const rolePrompt = `
        你是一个智能的笔记助手，你的任务是基于用户提供的笔记内容，为其查询提供一个有深度、有启发的回答。

        ## 核心任务
        仔细分析以下用---分隔的笔记内容，然后回答用户的问题。

        ## 相关笔记内容：
        ---
        ${context}
        ---

        ## 输出格式要求
        你必须严格按照以下JSON格式返回你的回答，将你的所有分析和洞察都放在 "answer" 字段中：
        {
          "answer": "在这里填写你整合、分析后生成的回答内容..."
        }

        ## 回答指引：
        1.  **核心回答**：直接回应用户的问题。
        2.  **整合信息**：将分散的笔记内容整合成连贯的叙述。
        3.  **引用佐证**：可以引用具体的笔记片段来支持你的观点。
        4.  **保持简洁**：避免冗长和不相关的细节。
        5.  **启发性**：以温暖、启发性的语气，像一个了解用户的朋友一样进行回应。

        现在，请根据以上要求，为用户的问题生成回答。
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
        try {
            const jsonResponse = JSON.parse(response.content);
            answer = jsonResponse.answer;
            if (!answer) {
                throw new Error("AI response JSON does not contain 'answer' field.");
            }
        } catch (e: any) {
            console.error("❌ Failed to parse AI JSON response:", e.message);
            // Fallback to using the raw content if parsing fails
            answer = response.content;
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 AI Search completed successfully in ${duration.toFixed(2)}s. Found ${sources.length} sources.`);

        // 5. Return the complete response as JSON
        return new Response(JSON.stringify({
            answer,
            resultsCount: sources.length,
            processingTime: duration,
            sources: sources
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