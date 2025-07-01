import { createClient } from "@libsql/client";
import {
    generateEmbedding,
    embeddingToBuffer,
    bufferToEmbedding,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";


// --- Clients Setup ---
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const TOP_K = 10; // Maximum related memos to return
const SIMILARITY_THRESHOLD = 0.5; // Cosine distance threshold (lower is more similar)

console.log("🔧 AI Related Memos Route initialized");

/**
 * Gets or generates an embedding for a given memo.
 * It prioritizes using a valid, existing embedding. If not available,
 * it generates a new one and saves it to the database asynchronously.
 */
async function getMemoEmbedding(memoId: string): Promise<number[]> {
    try {
        const existingMemo = await turso.execute({
            sql: "SELECT content, embedding FROM memos WHERE id = ? AND deleted_at IS NULL",
            args: [memoId],
        });

        if (existingMemo.rows.length === 0) {
            throw new Error("Memo not found or deleted");
        }

        const content = String(existingMemo.rows[0].content);
        const existingEmbedding = existingMemo.rows[0].embedding;

        // Try to use existing embedding if valid
        if (existingEmbedding && (existingEmbedding as any).length > 0) {
            try {
                const embeddingArray = bufferToEmbedding(existingEmbedding as unknown as Buffer);
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
        const embeddingBuffer = embeddingToBuffer(newEmbedding);
        turso.execute({
            sql: "UPDATE memos SET embedding = ? WHERE id = ?",
            args: [embeddingBuffer, memoId],
        }).catch(saveError => {
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
 * Performs vector similarity search to find related memos, filtering by a similarity threshold.
 */
async function findRelatedMemos(memoId: string, queryVectorBuffer: Buffer): Promise<any[]> {
    console.log("🔍 Searching for related memos...");

    try {
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
                        AND V.distance < ?
                        ORDER BY V.distance ASC;
                    `,
                    args: [indexName, queryVectorBuffer, TOP_K + 1, memoId, SIMILARITY_THRESHOLD], // +1 to exclude self
                });

                if (indexedSearchResult.rows.length > 0) {
                    return indexedSearchResult.rows;
                }
            } catch (indexError: any) {
                console.log("⚠️ Vector index search failed, falling back to full table scan:", indexError.message);
            }
        }

        console.log("🔄 Using full table scan with vector distance calculation...");
        const fullScanResult = await turso.execute({
            sql: `
                SELECT id, content, created_at, updated_at,
                       vector_distance_cos(embedding, ?) as similarity_score
                FROM memos 
                WHERE embedding IS NOT NULL
                AND id != ? 
                AND deleted_at IS NULL
                AND vector_distance_cos(embedding, ?) < ?
                ORDER BY similarity_score ASC
                LIMIT ?;
            `,
            args: [queryVectorBuffer, memoId, queryVectorBuffer, SIMILARITY_THRESHOLD, TOP_K],
        });

        return fullScanResult.rows;

    } catch (error: any) {
        console.error("❌ Vector search failed:", error);
        throw new Error(`Vector search failed: ${error.message}`);
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

        // 1. Get memo embedding
        const embedding = await getMemoEmbedding(memoId);
        const queryVectorBuffer = embeddingToBuffer(embedding);

        // 2. Find related memos using vector similarity
        const searchResults = await findRelatedMemos(memoId, queryVectorBuffer);

        // 3. Process and format results
        const relatedMemos = searchResults.map(row => ({
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

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Found ${relatedMemos.length} related memos in ${duration.toFixed(2)}s.`);

        return new Response(JSON.stringify({
            relatedMemos,
            count: relatedMemos.length,
            processingTime: duration
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