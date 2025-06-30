import { PrismaClient } from "@prisma/client";
import { createClient, Client } from "@libsql/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// --- Clients Setup ---
const prisma = new PrismaClient();
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

console.log("🔧 Environment setup:");
console.log("- TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✅ Set" : "❌ Missing");
console.log("- TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "✅ Set" : "❌ Missing");
console.log("- SILICONFLOW_API_KEY:", process.env.SILICONFLOW_API_KEY ? "✅ Set" : "❌ Missing");

// --- API Config ---
const siliconflowApiKey = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";
const BATCH_SIZE = 32; // Comply with SiliconFlow's API limit

if (!siliconflowApiKey) {
    throw new Error("SILICONFLOW_API_KEY is not defined in the environment variables.");
}

/**
 * Fetches embeddings for a batch of texts from the SiliconFlow API.
 * @param texts - An array of strings to embed.
 * @returns A promise that resolves to an array of embeddings (number arrays).
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        console.log("⚠️  No texts to embed, returning empty array");
        return [];
    }

    console.log(`🔄 Calling SiliconFlow API for ${texts.length} texts...`);
    console.log("📝 Text samples:", texts.slice(0, 3).map(t => t.substring(0, 50) + "..."));

    try {
        const response = await axios.post(
            SILICONFLOW_API_URL,
            { model: EMBEDDING_MODEL, input: texts },
            {
                headers: {
                    Authorization: `Bearer ${siliconflowApiKey}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ SiliconFlow API response received");
        console.log("📊 Response data structure:", {
            hasData: !!response.data,
            dataLength: response.data?.data?.length || 0,
            firstEmbeddingLength: response.data?.data?.[0]?.embedding?.length || 0
        });

        const sortedData = response.data.data.sort((a: any, b: any) => a.index - b.index);
        const embeddings = sortedData.map((item: any) => item.embedding);

        console.log(`🎯 Generated ${embeddings.length} embeddings, each with ${embeddings[0]?.length || 0} dimensions`);

        return embeddings;
    } catch (error: any) {
        console.error("❌ Error getting embeddings from SiliconFlow:");
        console.error("- Error message:", error.message);
        console.error("- Response data:", error.response?.data);
        console.error("- Status:", error.response?.status);
        throw error;
    }
}

/**
 * Syncs all memos from PostgreSQL to Turso, including generating and storing embeddings.
 */
async function syncMemosAndEmbeddings(turso: Client) {
    console.log("\n🚀 Starting memos sync with embeddings...");
    const memos = await prisma.memo.findMany();

    console.log(`📋 Found ${memos.length} memos to sync`);

    if (memos.length === 0) {
        console.log("⚠️  No memos to sync.");
        return;
    }

    let totalSynced = 0;
    const totalBatches = Math.ceil(memos.length / BATCH_SIZE);

    for (let i = 0; i < memos.length; i += BATCH_SIZE) {
        const batchMemos = memos.slice(i, i + BATCH_SIZE);
        const contents = batchMemos.map(memo => memo.content.trim());
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`\n📦 Processing batch ${currentBatch}/${totalBatches} (${batchMemos.length} memos)...`);

        try {
            const embeddings = await getEmbeddings(contents);

            if (embeddings.length !== batchMemos.length) {
                console.error(`❌ Mismatch: ${batchMemos.length} memos but ${embeddings.length} embeddings`);
                throw new Error("Embedding count mismatch");
            }

            const statements = batchMemos.map((memo, index) => {
                const embedding = embeddings[index];
                const embeddingBuffer = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;

                console.log(`  📝 Memo ${index + 1}: "${memo.content.substring(0, 30)}..." -> Embedding: ${embedding ? embedding.length + ' dims' : 'null'}, Buffer: ${embeddingBuffer ? embeddingBuffer.length + ' bytes' : 'null'}`);

                return {
                    sql: `
              INSERT INTO memos (id, content, images, created_at, updated_at, embedding)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                images = excluded.images,
                updated_at = excluded.updated_at,
                embedding = excluded.embedding;
            `,
                    args: [
                        memo.id,
                        memo.content,
                        JSON.stringify(memo.images),
                        memo.createdAt.toISOString(),
                        memo.updatedAt.toISOString(),
                        embeddingBuffer,
                    ],
                };
            });

            await turso.batch(statements, "write");
            totalSynced += statements.length;
            console.log(`✅ Batch ${currentBatch} synced successfully (${statements.length} memos)`);

        } catch (error) {
            console.error(`❌ Error in batch ${currentBatch}:`, error);
            throw error;
        }
    }

    console.log(`\n🎉 Total synced: ${totalSynced} memos with embeddings`);
}

/**
 * Syncs all tags, links, and their relationships from PostgreSQL to Turso.
 */
async function syncRelations(turso: Client) {
    console.log("\n🔗 Starting relations sync (tags, links, relationships)...");

    // Sync Tags
    const tags = await prisma.tag.findMany();
    console.log(`🏷️  Found ${tags.length} tags to sync`);

    if (tags.length > 0) {
        const tagStatements = tags.map(tag => ({
            sql: "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [tag.id, tag.name, tag.createdAt.toISOString()],
        }));
        await turso.batch(tagStatements, "write");
        console.log(`✅ Synced ${tags.length} tags.`);
    }

    // Sync Links
    const links = await prisma.link.findMany();
    console.log(`🔗 Found ${links.length} links to sync`);

    if (links.length > 0) {
        const linkStatements = links.map(link => ({
            sql: "INSERT INTO links (id, link, text, memo_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [link.id, link.url, link.text, link.memoId, link.createdAt.toISOString()],
        }));
        await turso.batch(linkStatements, "write");
        console.log(`✅ Synced ${links.length} links.`);
    }

    // Sync Memo-Tag Relationships
    const memosWithTags = await prisma.memo.findMany({ include: { tags: true } });
    const relationStatements = memosWithTags.flatMap(memo =>
        memo.tags.map(tag => ({
            sql: "INSERT INTO _MemoToTag (A, B) VALUES (?, ?) ON CONFLICT(A, B) DO NOTHING;",
            args: [memo.id, tag.id],
        }))
    );

    console.log(`🔄 Found ${relationStatements.length} memo-tag relations to sync`);

    if (relationStatements.length > 0) {
        await turso.batch(relationStatements, "write");
        console.log(`✅ Synced ${relationStatements.length} memo-tag relations.`);
    }
}

/**
 * Main function to orchestrate the entire sync process.
 */
async function main() {
    const startTime = Date.now();
    console.log("🚀 Starting full data sync to Turso with embeddings...");
    console.log("⏰ Start time:", new Date().toISOString());

    try {
        await syncMemosAndEmbeddings(turso);
        await syncRelations(turso);

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✅ Full sync complete! Duration: ${duration.toFixed(2)}s`);
        console.log("⏰ End time:", new Date().toISOString());

    } catch (error) {
        console.error("\n❌ A critical error occurred during the sync process:");
        console.error(error);
        process.exit(1);
    } finally {
        console.log("\n🔧 Cleaning up connections...");
        await prisma.$disconnect();
        turso.close();
        console.log("✅ Cleanup complete");
    }
}

main();
