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
async function syncMemosAndEmbeddings(turso: Client, lastSyncTimestamp: string) {
    console.log(`\n🚀 开始自 ${new Date(lastSyncTimestamp).toLocaleString()} 起的增量笔记同步...`);

    // 1. 处理已删除的笔记
    const deletedMemos = await prisma.memo.findMany({
        where: {
            deleted_at: {
                not: null,
                gt: new Date(lastSyncTimestamp),
            },
        },
    });

    if (deletedMemos.length > 0) {
        console.log(`🗑️ 发现 ${deletedMemos.length} 条笔记需要从 Turso 删除。`);
        const deleteStatements = deletedMemos.map(memo => ({
            sql: "DELETE FROM memos WHERE id = ?;",
            args: [memo.id],
        }));
        await turso.batch(deleteStatements, "write");
        console.log(`✅ 成功从 Turso 删除 ${deletedMemos.length} 条笔记。`);
    } else {
        console.log("✅ 没有需要删除的笔记。");
    }

    // 2. 处理新增和已更新的笔记
    const memosToSync = await prisma.memo.findMany({
        where: {
            updatedAt: { gt: new Date(lastSyncTimestamp) },
            deleted_at: null,
        },
    });

    console.log(`📋 发现 ${memosToSync.length} 条新增或更新的笔记需要同步`);

    if (memosToSync.length === 0) {
        console.log("✅ 没有新增或更新的笔记。");
        return;
    }

    let totalSynced = 0;
    const totalBatches = Math.ceil(memosToSync.length / BATCH_SIZE);

    for (let i = 0; i < memosToSync.length; i += BATCH_SIZE) {
        const batchMemos = memosToSync.slice(i, i + BATCH_SIZE);
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
                        INSERT INTO memos (id, content, images, created_at, updated_at, embedding, deleted_at)
                        VALUES (?, ?, ?, ?, ?, ?, NULL)
                        ON CONFLICT(id) DO UPDATE SET
                            content = excluded.content,
                            images = excluded.images,
                            updated_at = excluded.updated_at,
                            embedding = excluded.embedding,
                            deleted_at = NULL;
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

    console.log(`\n🎉 增量同步完成：总共处理了 ${totalSynced} 条笔记`);
}

/**
 * Syncs all tags, links, and their relationships from PostgreSQL to Turso.
 */
async function syncRelations(turso: Client, lastSyncTimestamp: string) {
    console.log("\n🔗 开始增量同步关联数据...");

    // 标签和链接的同步保持全量，因为它们不常变动且成本低
    const tags = await prisma.tag.findMany();
    if (tags.length > 0) {
        console.log(`🏷️  同步 ${tags.length} 个标签...`);
        const tagStatements = tags.map(tag => ({
            sql: "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [tag.id, tag.name, tag.createdAt.toISOString()],
        }));
        await turso.batch(tagStatements, "write");
    }

    const links = await prisma.link.findMany();
    if (links.length > 0) {
        console.log(`🔗 同步 ${links.length} 个链接...`);
        const linkStatements = links.map(link => ({
            sql: "INSERT INTO links (id, link, text, memo_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [link.id, link.url, link.text, link.memoId, link.createdAt.toISOString()],
        }));
        await turso.batch(linkStatements, "write");
    }

    // 只同步已变更笔记的关联关系
    const updatedMemosWithTags = await prisma.memo.findMany({
        where: { updatedAt: { gt: new Date(lastSyncTimestamp) } },
        include: { tags: true }
    });

    if (updatedMemosWithTags.length > 0) {
        const relationStatements = updatedMemosWithTags.flatMap(memo =>
            memo.tags.map(tag => ({
                sql: "INSERT INTO _MemoToTag (A, B) VALUES (?, ?) ON CONFLICT(A, B) DO NOTHING;",
                args: [memo.id, tag.id],
            }))
        );

        if (relationStatements.length > 0) {
            console.log(`🔄 同步 ${relationStatements.length} 条笔记-标签关联...`);
            await turso.batch(relationStatements, "write");
        }
    } else {
        console.log("✅ 没有需要更新的笔记-标签关联。");
    }
}

/**
 * Ensures the necessary tables and columns exist in Turso DB.
 */
async function setupTurso(turso: Client) {
    console.log("\n🔧 正在检查并设置 Turso 数据库...");
    try {
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        // 使用 PRAGMA 检查列是否存在
        const memoTableInfo = await turso.execute("PRAGMA table_info(memos);");
        // @ts-ignore
        const hasDeletedAt = memoTableInfo.rows.some(row => row.name === "deleted_at");

        if (!hasDeletedAt) {
            console.log("📝 正在为 Turso 的 'memos' 表添加 'deleted_at' 列...");
            await turso.execute("ALTER TABLE memos ADD COLUMN deleted_at TEXT;");
            console.log("✅ 'deleted_at' 列已成功添加。");
        }

        console.log("✅ Turso 数据库设置检查完成。");
    } catch (error) {
        console.error("❌ 设置 Turso 数据库时失败：", error);
        throw error;
    }
}

/**
 * Main function to orchestrate the entire sync process.
 */
async function main() {
    const startTime = Date.now();
    const currentSyncStartTime = new Date();
    console.log(`🚀 开始增量同步... (当前时间: ${currentSyncStartTime.toLocaleString()})`);

    try {
        await setupTurso(turso);

        // 获取上次同步的时间戳
        let lastSyncTimestamp = "1970-01-01T00:00:00.000Z"; // 默认从纪元初开始
        const result = await turso.execute({
            sql: "SELECT value FROM sync_metadata WHERE key = ?;",
            args: ["last_successful_sync"],
        });

        if (result.rows.length > 0) {
            lastSyncTimestamp = result.rows[0].value as string;
        }

        console.log(`🕒 将同步自 ${new Date(lastSyncTimestamp).toLocaleString()} 以来的变更。`);

        await syncMemosAndEmbeddings(turso, lastSyncTimestamp);
        await syncRelations(turso, lastSyncTimestamp);

        // 更新同步时间戳
        await turso.execute({
            sql: `
                INSERT INTO sync_metadata (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            `,
            args: ["last_successful_sync", currentSyncStartTime.toISOString()],
        });

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✅ 增量同步成功！耗时: ${duration.toFixed(2)} 秒`);
        console.log(`💾 新的同步时间点已记录: ${currentSyncStartTime.toLocaleString()}`);

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
