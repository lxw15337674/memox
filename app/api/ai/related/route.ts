import { createClient } from "@libsql/client";
import axios from "axios";
import { API_URL } from "../../../../src/api/config";

export const runtime = "edge";

// --- Clients Setup ---
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

// --- API Config ---
const siliconflowApiKey = process.env.SILICONFLOW_API_KEY!;
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-4B";
const TOP_K = 10; // Maximum related memos to return

console.log("🔧 AI Related Memos Route initialized");

/**
 * Generates an embedding for a given text using the SiliconFlow API.
 */
async function getEmbedding(text: string): Promise<number[]> {
    console.log("🔄 Generating embedding for memo content:", text.substring(0, 50) + "...");

    try {
        const response = await axios.post(
            SILICONFLOW_API_URL,
            { model: EMBEDDING_MODEL, input: [text] },
            {
                headers: {
                    Authorization: `Bearer ${siliconflowApiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            }
        );

        console.log("✅ Embedding generated successfully, dimensions:", response.data.data[0].embedding.length);
        return response.data.data[0].embedding;
    } catch (error: any) {
        console.error("❌ Error generating embedding:", error.message);
        throw new Error(`Failed to generate embedding: ${error.message}`);
    }
}

/**
 * Gets the memo content and generates embedding for similarity search
 */
async function getMemoEmbedding(memoId: string): Promise<{ content: string; embedding: number[] }> {
    console.log("📝 Fetching memo content for ID:", memoId);

    try {
        // First try to get existing embedding from database
        const existingMemo = await turso.execute({
            sql: "SELECT content, embedding FROM memos WHERE id = ? AND deleted_at IS NULL",
            args: [memoId],
        });

        if (existingMemo.rows.length === 0) {
            throw new Error("Memo not found or deleted");
        }

        const content = String(existingMemo.rows[0].content);
        const existingEmbedding = existingMemo.rows[0].embedding;

        // Check if content is not empty for embedding generation
        if (!content || content.trim().length === 0) {
            throw new Error("Memo content is empty, cannot generate embedding");
        }

        // If memo already has embedding, use it (check for valid length)
        if (existingEmbedding && (existingEmbedding as any).length > 0) {
            console.log("✅ Using existing embedding from database");
            try {
                const embeddingBuffer = existingEmbedding as unknown as Buffer;
                const embeddingArray = Array.from(new Float32Array(embeddingBuffer.buffer));

                // Validate embedding length (should be 1024 for Qwen/Qwen3-Embedding-4B)
                if (embeddingArray.length === 1024) {
                    return { content, embedding: embeddingArray };
                } else {
                    console.warn(`⚠️ Existing embedding has incorrect length: ${embeddingArray.length}, regenerating...`);
                }
            } catch (embeddingError) {
                console.warn("⚠️ Failed to parse existing embedding, regenerating:", embeddingError);
            }
        }

        // Otherwise generate new embedding
        console.log("🔄 Generating new embedding for memo");
        const embedding = await getEmbedding(content);

        // Optionally save the embedding back to database
        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
        try {
            await turso.execute({
                sql: "UPDATE memos SET embedding = ? WHERE id = ?",
                args: [embeddingBuffer, memoId],
            });
            console.log("💾 Saved new embedding to database");
        } catch (saveError) {
            console.warn("⚠️ Failed to save embedding to database:", saveError);
            // Continue without saving
        }

        return { content, embedding };
    } catch (error: any) {
        console.error("❌ Error getting memo embedding:", error);
        throw error;
    }
}

/**
 * Performs vector similarity search to find related memos
 */
async function findRelatedMemos(memoId: string, queryVectorBuffer: Buffer): Promise<any[]> {
    console.log("🔍 Searching for related memos...");

    try {
        // First, try using vector index if available
        const indexCheckResult = await turso.execute({
            sql: "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%memos%' AND name LIKE '%embedding%';",
            args: [],
        });

        if (indexCheckResult.rows.length > 0) {
            try {
                const indexName = indexCheckResult.rows[0].name as string;
                console.log(`🎯 Using vector index: ${indexName}`);

                const indexedSearchResult = await turso.execute({
                    sql: `
                        SELECT T.id, T.content, T.created_at, T.updated_at, V.distance as similarity_score
                        FROM vector_top_k(?, ?, ?) AS V
                        JOIN memos AS T ON T.id = V.id
                        WHERE T.id != ? 
                        AND T.deleted_at IS NULL 
                        AND T.embedding IS NOT NULL 
                        AND LENGTH(T.embedding) > 0
                        ORDER BY V.distance ASC;
                    `,
                    args: [indexName, queryVectorBuffer, TOP_K + 1, memoId], // +1 to account for excluding self
                });

                if (indexedSearchResult.rows.length > 0) {
                    console.log(`✅ Indexed search found ${indexedSearchResult.rows.length} results`);
                    return indexedSearchResult.rows;
                }
            } catch (indexError: any) {
                console.log("⚠️ Vector index search failed, falling back:", indexError.message);
            }
        }

        // Fallback to full table scan
        console.log("🔄 Using full table scan with vector distance calculation...");
        const fullScanResult = await turso.execute({
            sql: `
                SELECT id, content, created_at, updated_at,
                       vector_distance_cos(embedding, ?) as similarity_score
                FROM memos 
                WHERE embedding IS NOT NULL 
                AND LENGTH(embedding) > 0
                AND id != ? 
                AND deleted_at IS NULL
                ORDER BY similarity_score ASC
                LIMIT ?;
            `,
            args: [queryVectorBuffer, memoId, TOP_K],
        });

        console.log(`✅ Full scan found ${fullScanResult.rows.length} results`);
        return fullScanResult.rows;

    } catch (error: any) {
        console.error("❌ Vector search failed:", error);
        throw new Error(`Vector search failed: ${error.message}`);
    }
}

// Main API handler for the POST request
export async function POST(req: Request) {
    const startTime = Date.now();
    console.log("\n🚀 Related Memos API called at:", new Date().toISOString());

    try {
        const { memoId } = await req.json();

        if (!memoId || typeof memoId !== 'string') {
            console.log("❌ Invalid memoId received:", memoId);
            return new Response(JSON.stringify({
                error: "memoId is required and must be a string"
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log("📝 Processing request for memo ID:", memoId);

        // 1. Get memo content and embedding
        console.log("\n📍 Step 1: Getting memo embedding...");
        const { content: memoContent, embedding } = await getMemoEmbedding(memoId);
        const queryVectorBuffer = Buffer.from(new Float32Array(embedding).buffer);
        console.log("✅ Memo embedding ready, buffer size:", queryVectorBuffer.length, "bytes");

        // 2. Find related memos using vector search
        console.log("\n📍 Step 2: Searching for related memos...");
        const searchResults = await findRelatedMemos(memoId, queryVectorBuffer);

        if (searchResults.length === 0) {
            console.log("⚠️ No related memos found");
            return new Response(JSON.stringify({
                relatedMemos: [],
                totalCount: 0,
                processingTime: (Date.now() - startTime) / 1000
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 3. Process and filter results
        console.log("\n📍 Step 3: Processing search results...");

        const allResults = searchResults.map(row => ({
            id: String(row.id),
            content: String(row.content),
            similarity: row.similarity_score ? parseFloat(String(row.similarity_score)) : null,
            preview: String(row.content).substring(0, 150) + (String(row.content).length > 150 ? "..." : ""),
            createdAt: row.created_at ? String(row.created_at) : null,
            updatedAt: row.updated_at ? String(row.updated_at) : null,
            displayDate: row.created_at ? new Date(String(row.created_at)).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : '未知日期',
            tags: [] as string[]
        }));

        // Filter by similarity threshold (50% = cosine distance <= 0.5)
        const relatedMemos = allResults.filter(memo => {
            if (memo.similarity === null) {
                console.log(`⚠️ Excluding memo ${memo.id} - no similarity score`);
                return false;
            }

            const similarityPercentage = (1 - memo.similarity) * 100;
            const meetsThreshold = similarityPercentage > 50;

            if (!meetsThreshold) {
                console.log(`📊 Excluding memo ${memo.id} - similarity ${similarityPercentage.toFixed(1)}% <= 50%`);
            }

            return meetsThreshold;
        });

        console.log(`📊 Filtered results: ${relatedMemos.length}/${allResults.length} memos with >50% similarity`);

        // 4. Get tags for related memos
        if (relatedMemos.length > 0) {
            console.log("\n📍 Step 4: Fetching tags for related memos...");
            const memoIds = relatedMemos.map(memo => memo.id);
            const tagsQuery = `
                SELECT m.id as memo_id, t.name as tag_name
                FROM memos m
                LEFT JOIN _MemoToTag mt ON m.id = mt.A
                LEFT JOIN tags t ON mt.B = t.id
                WHERE m.id IN (${memoIds.map(() => '?').join(',')})
            `;

            try {
                const tagsResult = await turso.execute({
                    sql: tagsQuery,
                    args: memoIds,
                });

                // Group tags by memo ID
                const tagsByMemo: Record<string, string[]> = {};
                tagsResult.rows.forEach(row => {
                    const memoId = String(row.memo_id);
                    const tagName = row.tag_name ? String(row.tag_name) : null;

                    if (!tagsByMemo[memoId]) {
                        tagsByMemo[memoId] = [];
                    }

                    if (tagName) {
                        tagsByMemo[memoId].push(tagName);
                    }
                });

                // Add tags to related memos
                relatedMemos.forEach(memo => {
                    memo.tags = tagsByMemo[memo.id] || [];
                });

                console.log("✅ Tags added to related memos");
            } catch (tagsError) {
                console.warn("⚠️ Failed to fetch tags, continuing without them:", tagsError);
                relatedMemos.forEach(memo => {
                    memo.tags = [];
                });
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Related memos search completed successfully in ${duration.toFixed(2)}s`);

        return new Response(JSON.stringify({
            relatedMemos,
            totalCount: relatedMemos.length,
            processingTime: duration
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        console.error(`\n❌ Related memos search failed after ${duration.toFixed(2)}s:`, error);

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