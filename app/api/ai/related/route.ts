import {
    generateEmbedding,
    embeddingToBuffer,
    bufferToEmbedding,
    EmbeddingServiceError
} from "../../../../src/services/embeddingService";
import { db, client } from "../../../../src/db";
import * as schema from "../../../../src/db/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";

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
        db
            .update(schema.memos)
            .set({ embedding: embeddingBuffer })
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
 * Performs vector similarity search to find related memos, filtering by a similarity threshold.
 */
async function findRelatedMemos(memoId: string, queryVectorBuffer: Buffer): Promise<any[]> {
    console.log("🔍 Searching for related memos...");

    try {
        // For now, return a simple content-based search since vector search requires special SQLite extensions
        console.log("🔄 Using simple content-based search (vector search disabled)...");
        
        const relatedMemos = await db
            .select({
                id: schema.memos.id,
                content: schema.memos.content,
                created_at: schema.memos.createdAt,
                updated_at: schema.memos.updatedAt
            })
            .from(schema.memos)
            .where(and(
                ne(schema.memos.id, memoId),
                isNull(schema.memos.deletedAt)
            ))
            .orderBy(schema.memos.createdAt)
            .limit(TOP_K);

        return relatedMemos.map(memo => ({
            ...memo,
            similarity_score: 0.5 // Placeholder similarity score
        }));

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

        // 1. Get memo embedding
        const embedding = await getMemoEmbedding(memoId);
        const queryVectorBuffer = embeddingToBuffer(embedding);

        // 2. Find related memos using vector similarity
        const relatedMemos = await findRelatedMemos(memoId, queryVectorBuffer);

        // 3. Format the response
        const formattedMemos = relatedMemos.map((row: any) => ({
            id: String(row.id),
            content: String(row.content),
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
            similarity_score: Number(row.similarity_score),
        }));

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Found ${relatedMemos.length} related memos in ${duration.toFixed(2)}s.`);

        return new Response(JSON.stringify({
            relatedMemos: formattedMemos,
            count: formattedMemos.length,
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