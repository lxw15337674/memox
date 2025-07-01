import { createClient } from "@libsql/client";
import {
    generateEmbedding,
    embeddingToBuffer,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";
import {
    callAI,
    AIServiceError
} from "../../../../src/services/aiService";

export const runtime = "edge";

// --- Clients Setup ---
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});
const TOP_K = 10; // Retrieve top 10 most similar memos

console.log("🔧 AI Search Route initialized with config:");
console.log("- TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✅ Set" : "❌ Missing");
console.log("- SILICONFLOW_API_KEY:", process.env.SILICONFLOW_API_KEY ? "✅ Set" : "❌ Missing");

/**
 * Wrapper function for generating embeddings using the embedding service
 */
async function getEmbedding(text: string): Promise<number[]> {
    console.log("🔄 Generating embedding for query:", text.substring(0, 50) + "...");

    try {
        const embedding = await generateEmbedding(text);
        console.log("✅ Embedding generated successfully, dimensions:", embedding.length);
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
    console.log("🔍 Performing vector similarity search...");

    try {
        // First, let's check if we have a vector index created
        const indexCheckResult = await turso.execute({
            sql: "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%memos%' AND name LIKE '%embedding%';",
            args: [],
        });

        console.log("📋 Available vector indexes:", indexCheckResult.rows.map(row => row.name));

        // Method 1: Try using vector index if available
        if (indexCheckResult.rows.length > 0) {
            try {
                const indexName = indexCheckResult.rows[0].name as string;
                console.log(`🎯 Using vector index: ${indexName}`);

                const indexedSearchResult = await turso.execute({
                    sql: `
                        SELECT T.id, T.content, T.created_at, T.updated_at, V.distance as similarity_score
                        FROM vector_top_k(?, ?, ?) AS V
                        JOIN memos AS T ON T.id = V.id
                        ORDER BY V.distance ASC;
                    `,
                    args: [indexName, queryVectorBuffer, TOP_K],
                });

                console.log(`✅ Indexed vector search completed, found ${indexedSearchResult.rows.length} results`);
                if (indexedSearchResult.rows.length > 0) {
                    console.log("📊 Indexed results preview:", indexedSearchResult.rows.slice(0, 2).map(row => ({
                        id: row.id,
                        content: String(row.content).substring(0, 50) + "..."
                    })));
                    return indexedSearchResult.rows;
                }
            } catch (indexError: any) {
                console.log("⚠️  Vector index search failed, falling back to full table scan:", indexError.message);
            }
        }

        // Method 2: Fallback to full table scan with distance calculation
        console.log("🔄 Using full table scan with vector distance calculation...");
        const fullScanResult = await turso.execute({
            sql: `
                SELECT id, content, created_at, updated_at,
                       vector_distance_cos(embedding, ?) as similarity_score
                FROM memos 
                WHERE embedding IS NOT NULL
                ORDER BY similarity_score ASC
                LIMIT ?;
            `,
            args: [queryVectorBuffer, TOP_K],
        });

        console.log(`✅ Full table scan completed, found ${fullScanResult.rows.length} results`);
        if (fullScanResult.rows.length > 0) {
            console.log("📊 Full scan results preview:", fullScanResult.rows.slice(0, 2).map(row => ({
                id: row.id,
                content: String(row.content).substring(0, 50) + "...",
                similarity: row.similarity_score,
                created_at: row.created_at
            })));
        }

        return fullScanResult.rows;

    } catch (error: any) {
        console.error("❌ All vector search methods failed, trying random fallback...");

        // Method 3: Final fallback - random selection of memos with embeddings
        try {
            const fallbackResult = await turso.execute({
                sql: `
                    SELECT id, content, created_at, updated_at
                    FROM memos 
                    WHERE embedding IS NOT NULL
                    ORDER BY RANDOM()
                    LIMIT ?;
                `,
                args: [TOP_K],
            });

            console.log("⚠️  Using random fallback due to all vector search errors");
            console.log("📊 Random fallback results count:", fallbackResult.rows.length);

            return fallbackResult.rows;
        } catch (fallbackError: any) {
            console.error("❌ Even random fallback failed:", fallbackError);
            throw new Error(`All search methods failed. Primary error: ${error.message}. Fallback error: ${fallbackError.message}`);
        }
    }
}

// Main API handler for the POST request
export async function POST(req: Request) {
    const startTime = Date.now();
    console.log("\n🚀 AI Search API called at:", new Date().toISOString());

    try {
        const { query } = await req.json();

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
        console.log("📝 Processing query:", trimmedQuery);

        // 1. Vectorize the user's query
        console.log("\n📍 Step 1: Vectorizing query...");
        const queryEmbedding = await getEmbedding(trimmedQuery);
        const queryVectorBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);
        console.log("✅ Query vectorized, buffer size:", queryVectorBuffer.length, "bytes");

        // 2. Perform vector similarity search
        console.log("\n📍 Step 2: Performing vector search...");
        const searchResults = await performVectorSearch(queryVectorBuffer);

        if (searchResults.length === 0) {
            console.log("⚠️  No search results found");
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
        const allSources = searchResults.map(row => ({
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

        // Filter sources to only include those with similarity > 50%
        // similarity_score is cosine distance (lower = more similar)
        // For 50% similarity threshold: similarity_score <= 0.5
        const sources = allSources.filter(source => {
            if (source.similarity === null) {
                // For strict similarity filtering, exclude results without similarity scores
                // This typically happens with random fallback results
                console.log(`⚠️  Excluding source ${source.id} - no similarity score available`);
                return false;
            }
            // Convert similarity score to percentage: (1 - similarity_score) * 100
            const similarityPercentage = (1 - source.similarity) * 100;
            const meetsThreshold = similarityPercentage > 50;
            if (!meetsThreshold) {
                console.log(`📊 Excluding source ${source.id} - similarity ${similarityPercentage.toFixed(1)}% <= 50%`);
            }
            return meetsThreshold;
        });

        console.log(`📊 Application-level filtering: ${sources.length}/${allSources.length} sources with >50% similarity`);

        // If no sources meet the similarity threshold, return early
        if (sources.length === 0) {
            console.log("⚠️  No sources meet the 50% similarity threshold after application-level filtering");
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
        console.log("📋 Context prepared, total length:", context.length, "characters");
        console.log("📊 Sources prepared:", sources.length, "items");

        // 3. Build the prompt for the language model
        console.log("\n📍 Step 3: Building prompt for LLM...");

        // Enhanced role prompt with better analysis and presentation
        const rolePrompt = `
        你是一个智能的笔记助手，专门帮助用户从他们的个人笔记库中挖掘有价值的信息和洞察。

        ## 你的核心能力：
        1. **深度理解**：能够理解用户问题的真实意图，包括显性和隐性需求
        2. **关联挖掘**：从看似无关的笔记中发现潜在联系和模式
        3. **智能整合**：将分散的信息整合成有启发性的回答
        4. **个性化呈现**：基于用户的思考风格和记录习惯提供定制化答案

        ## 当前查询的相关笔记内容：
        ---
        ${context}
        ---

        ## 回答指引：
        请基于以上笔记内容，为用户提供一个**有深度、有启发**的回答。具体要求：

        ### 📝 内容分析
        - 仔细分析用户问题的层次（表面问题 vs 深层需求）
        - 识别笔记中的关键信息、观点和模式
        - 发现不同笔记之间的关联和矛盾

        ### 🔍 答案结构
        1. **核心回答**：直接回应用户的问题
        2. **关键洞察**：从笔记中提炼的重要发现或启发
        3. **相关思考**：相关的其他观点或延伸思考
        4. **实用建议**：基于笔记内容的可行建议（如果适用）

        ### 💡 呈现要求
        - 保持回答**简洁而深入**，避免冗长
        - **引用具体的笔记片段**来支持观点
        - 如果发现有趣的关联或矛盾，请指出
        - 用温暖、启发性的语气，就像一个了解你的朋友

        ### ⚠️ 特殊情况处理
        - 如果笔记内容不足以回答问题，诚实说明并建议用户如何改进查询
        - 如果发现多个不同观点，客观呈现并帮助用户思考
        - 对于时间相关的查询，注意笔记的时间脉络和演变

        记住：你的目标不仅是回答问题，更是要帮助用户从自己的思考记录中获得新的启发和洞察。
        `;

        // 4. Generate the answer using AI API
        console.log("\n📍 Step 4: Generating answer with AI API...");
        const response = await callAI({
            messages: [
                { role: 'system', content: rolePrompt },
                { role: 'user', content: trimmedQuery }
            ],
            model: 'deepseek-ai/DeepSeek-V3',
            temperature: 0.5,
            maxTokens: 1500
        });
        const answer = response.content;
        console.log("✅ Answer generated successfully");

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 AI Search completed successfully in ${duration.toFixed(2)}s`);

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

        if (error instanceof AIServiceError) {
            console.error(`\n❌ AI Service Error after ${duration.toFixed(2)}s:`, error.code, error.message, error.details);
        } else if (error instanceof EmbeddingServiceError) {
            console.error(`\n❌ Embedding Service Error after ${duration.toFixed(2)}s:`, error.code, error.message, error.details);
        } else {
            console.error(`\n❌ AI Search failed after ${duration.toFixed(2)}s:`, error);
            console.error("Error stack:", error.stack);
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