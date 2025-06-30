import { createClient } from "@libsql/client";
import axios from "axios";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const runtime = "edge";

// --- Clients Setup ---
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const openai = createOpenAI({
    apiKey: process.env.MOONSHOT_API_KEY!,
    baseURL: "https://api.moonshot.cn/v1",
});

// --- API Config ---
const siliconflowApiKey = process.env.SILICONFLOW_API_KEY!;
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";
const TOP_K = 10; // Retrieve top 10 most similar memos

console.log("🔧 AI Search Route initialized with config:");
console.log("- TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✅ Set" : "❌ Missing");
console.log("- MOONSHOT_API_KEY:", process.env.MOONSHOT_API_KEY ? "✅ Set" : "❌ Missing");
console.log("- SILICONFLOW_API_KEY:", process.env.SILICONFLOW_API_KEY ? "✅ Set" : "❌ Missing");

/**
 * Generates an embedding for a given text using the SiliconFlow API.
 * @param text - The text to embed.
 * @returns A promise that resolves to the embedding vector.
 */
async function getEmbedding(text: string): Promise<number[]> {
    console.log("🔄 Generating embedding for query:", text.substring(0, 50) + "...");

    try {
        const response = await axios.post(
            SILICONFLOW_API_URL,
            { model: EMBEDDING_MODEL, input: [text] },
            {
                headers: {
                    Authorization: `Bearer ${siliconflowApiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 10000 // 10 second timeout
            }
        );

        console.log("✅ Embedding generated successfully, dimensions:", response.data.data[0].embedding.length);
        return response.data.data[0].embedding;
    } catch (error: any) {
        console.error("❌ Error generating embedding:");
        console.error("- Message:", error.message);
        console.error("- Response data:", error.response?.data);
        console.error("- Status:", error.response?.status);
        throw new Error(`Failed to generate embedding: ${error.message}`);
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
                answer: "很抱歉，我在你的笔记中没有找到与这个问题相关的内容。",
                usage: null,
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
                answer: "很抱歉，我在你的笔记中没有找到与这个问题高度相关的内容（相似度>50%）。",
                usage: null,
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
        const prompt = `
你是一个有用的助手，基于用户的个人笔记内容来回答问题。
用户的问题是："${trimmedQuery}"

以下是最相关的笔记内容：
---
${context}
---

请基于这些笔记内容提供一个全面的回答。如果笔记中没有包含足够的信息来回答问题，请明确告知你在笔记中找不到相关答案。
请保持回答简洁明了，并尽可能引用具体的笔记内容。
`;

        // 4. Generate the answer using Moonshot's chat model
        console.log("\n📍 Step 4: Generating answer with Moonshot...");
        const result = await generateText({
            model: openai("moonshot-v1-8k"),
            messages: [{ role: "user", content: prompt }],
            maxTokens: 1000,
            temperature: 0.7,
        });

        console.log("✅ Answer generated successfully");
        console.log("📊 Usage stats:", result.usage);

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 AI Search completed successfully in ${duration.toFixed(2)}s`);

        // 5. Return the complete response as JSON
        return new Response(JSON.stringify({
            answer: result.text,
            usage: result.usage,
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
        console.error(`\n❌ AI Search failed after ${duration.toFixed(2)}s:`, error);
        console.error("Error stack:", error.stack);

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