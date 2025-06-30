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

console.log("🔧 环境设置检查：");
console.log("- TURSO 数据库地址:", process.env.TURSO_DATABASE_URL ? "✅ 已设置" : "❌ 未设置");
console.log("- TURSO 认证令牌:", process.env.TURSO_AUTH_TOKEN ? "✅ 已设置" : "❌ 未设置");
console.log("- SiliconFlow API 密钥:", process.env.SILICONFLOW_API_KEY ? "✅ 已设置" : "❌ 未设置");

// --- API Config ---
const siliconflowApiKey = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";
const BATCH_SIZE = 16; // Comply with SiliconFlow's API limit

if (!siliconflowApiKey) {
    throw new Error("环境变量中未定义 SILICONFLOW_API_KEY。");
}

/**
 * Fetches embeddings for a batch of texts from the SiliconFlow API.
 * @param texts - An array of strings to embed.
 * @returns A promise that resolves to an array of embeddings (number arrays).
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        console.log("⚠️  没有需要生成向量的文本，返回空数组");
        return [];
    }

    console.log(`🔄 正在调用 SiliconFlow API 为 ${texts.length} 条文本生成向量...`);

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

        console.log("✅ 成功接收 SiliconFlow API 响应");
        const embeddings = response.data.data.sort((a: any, b: any) => a.index - b.index).map((item: any) => item.embedding);

        console.log(`🎯 成功生成 ${embeddings.length} 个向量，维度: ${embeddings[0]?.length || 0}`);

        return embeddings;
    } catch (error: any) {
        console.error("❌ 从 SiliconFlow 获取向量时出错：");
        console.error("- 错误信息:", error.message);
        if (error.response) {
            console.error("- 状态码:", error.response.status);
            console.error("- 响应数据:", error.response.data);
        }
        throw error;
    }
}

/**
 * Syncs all memos from PostgreSQL to Turso, including generating and storing embeddings.
 */
async function syncMemosAndEmbeddings(turso: Client) {
    console.log("\n🚀 开始同步笔记并生成向量...");
    const memos = await prisma.memo.findMany();

    console.log(`📋 发现 ${memos.length} 条笔记需要同步`);

    if (memos.length === 0) {
        console.log("⚠️  没有需要同步的笔记。");
        return;
    }

    let totalSynced = 0;
    const totalBatches = Math.ceil(memos.length / BATCH_SIZE);

    for (let i = 0; i < memos.length; i += BATCH_SIZE) {
        const batchMemos = memos.slice(i, i + BATCH_SIZE);
        const contents = batchMemos.map(memo => memo.content.trim());
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`\n📦 正在处理批次 ${currentBatch}/${totalBatches} (共 ${batchMemos.length} 条笔记)...`);

        try {
            const embeddings = await getEmbeddings(contents);

            if (embeddings.length !== batchMemos.length) {
                console.error(`❌ 数量不匹配：有 ${batchMemos.length} 条笔记，但只生成了 ${embeddings.length} 个向量`);
                throw new Error("向量数量与笔记数量不匹配");
            }

            const statements = batchMemos.map((memo, index) => {
                const embedding = embeddings[index];
                const embeddingBuffer = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;
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
            console.log(`✅ 批次 ${currentBatch} 同步成功 (共 ${statements.length} 条笔记)`);

        } catch (error) {
            console.error(`❌ 处理批次 ${currentBatch} 时出错：`, error);
            throw error;
        }
    }

    console.log(`\n🎉 同步完成：总共处理了 ${totalSynced} 条笔记`);
}

/**
 * Syncs all tags, links, and their relationships from PostgreSQL to Turso.
 */
async function syncRelations(turso: Client) {
    console.log("\n🔗 开始同步关联数据 (标签、链接、关系)...");

    // Sync Tags
    const tags = await prisma.tag.findMany();
    console.log(`🏷️  发现 ${tags.length} 个标签需要同步`);

    if (tags.length > 0) {
        const tagStatements = tags.map(tag => ({
            sql: "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [tag.id, tag.name, tag.createdAt.toISOString()],
        }));
        await turso.batch(tagStatements, "write");
        console.log(`✅ 成功同步 ${tags.length} 个标签。`);
    }

    // Sync Links
    const links = await prisma.link.findMany();
    console.log(`🔗 发现 ${links.length} 个链接需要同步`);

    if (links.length > 0) {
        const linkStatements = links.map(link => ({
            sql: "INSERT INTO links (id, link, text, memo_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [link.id, link.url, link.text, link.memoId, link.createdAt.toISOString()],
        }));
        await turso.batch(linkStatements, "write");
        console.log(`✅ 成功同步 ${links.length} 个链接。`);
    }

    // Sync Memo-Tag Relationships
    const memosWithTags = await prisma.memo.findMany({ include: { tags: true } });
    const relationStatements = memosWithTags.flatMap(memo =>
        memo.tags.map(tag => ({
            sql: "INSERT INTO _MemoToTag (A, B) VALUES (?, ?) ON CONFLICT(A, B) DO NOTHING;",
            args: [memo.id, tag.id],
        }))
    );

    console.log(`🔄 发现 ${relationStatements.length} 条笔记-标签关联需要同步`);

    if (relationStatements.length > 0) {
        await turso.batch(relationStatements, "write");
        console.log(`✅ 成功同步 ${relationStatements.length} 条笔记-标签关联。`);
    }
}

/**
 * Main function to orchestrate the entire sync process.
 */
async function main() {
    const startTime = Date.now();
    console.log("🚀 开始向 Turso 全量同步数据并生成向量...");
    console.log("⏰ 开始时间:", new Date().toISOString());

    try {
        await syncMemosAndEmbeddings(turso);
        await syncRelations(turso);

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✅ 全量同步完成！耗时: ${duration.toFixed(2)} 秒`);
        console.log("⏰ 结束时间:", new Date().toISOString());

    } catch (error) {
        console.error("\n❌ 同步过程中发生严重错误：");
        console.error(error);
        process.exit(1);
    } finally {
        console.log("\n🔧 正在清理并关闭连接...");
        await prisma.$disconnect();
        turso.close();
        console.log("✅ 清理完成");
    }
}

main();
