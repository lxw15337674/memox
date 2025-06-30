import { PrismaClient } from "@prisma/client";
import { createClient, Client, Transaction } from "@libsql/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// --- 客户端设置 ---
const prisma = new PrismaClient();
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

console.log("🔧 环境设置检查：");
console.log("- TURSO 数据库地址:", process.env.TURSO_DATABASE_URL ? "✅ 已设置" : "❌ 未设置");
console.log("- TURSO 认证令牌:", process.env.TURSO_AUTH_TOKEN ? "✅ 已设置" : "❌ 未设置");
console.log("- SiliconFlow API 密钥:", process.env.SILICONFLOW_API_KEY ? "✅ 已设置" : "❌ 未设置");

// --- API 配置 ---
const siliconflowApiKey = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";
const BATCH_SIZE = 16;

if (!siliconflowApiKey) {
    throw new Error("环境变量中未定义 SILICONFLOW_API_KEY。");
}

/**
 * 为一批文本获取向量。
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }
    const response = await axios.post(
        SILICONFLOW_API_URL,
        { model: EMBEDDING_MODEL, input: texts },
        { headers: { Authorization: `Bearer ${siliconflowApiKey}`, "Content-Type": "application/json" } }
    );
    return response.data.data.sort((a: any, b: any) => a.index - b.index).map((item: any) => item.embedding);
}

/**
 * 确保 Turso 数据库中有必要的元数据表和列。
 */
async function setupTurso(turso: Client) {
    await turso.execute(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    const memoTableInfo = await turso.execute("PRAGMA table_info(memos);");
    // @ts-ignore
    const hasDeletedAt = memoTableInfo.rows.some(row => row.name === "deleted_at");
    if (!hasDeletedAt) {
        await turso.execute("ALTER TABLE memos ADD COLUMN deleted_at TEXT;");
    }
}

/**
 * 在一个事务中同步所有标签。
 */
async function syncAllTagsInTransaction(tx: Transaction) {
// 标签的同步保持全量，因为它们不常变动且成本低
    const allTags = await prisma.tag.findMany();
    if (allTags.length > 0) {
        console.log(`🔗 同步所有 ${allTags.length} 个标签...`);
        const tagStatements = allTags.map(tag => ({
            sql: "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [tag.id, tag.name, tag.createdAt.toISOString()],
        }));
        await tx.batch(tagStatements);
    }
}

/**
 * 在一个事务中同步给定笔记的关联关系（链接、标签关系）。
 */
async function syncMemoRelationsInTransaction(tx: Transaction, syncedMemos: any[]) {
    if (syncedMemos.length === 0) {
        return;
    }

// 只同步已同步笔记的链接
    const linksToSync = syncedMemos.map(memo => memo.link).filter(Boolean);
    if (linksToSync.length > 0) {
        const linkStatements = linksToSync.map(link => ({
            sql: "INSERT INTO links (id, link, text, memo_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING;",
            args: [link.id, link.url, link.text, link.memoId, link.createdAt.toISOString()],
        }));
        await tx.batch(linkStatements);
    }

    // 只同步已同步笔记的标签关系
    const relationStatements = syncedMemos.flatMap(memo =>
        memo.tags.map((tag: any) => ({
            sql: "INSERT INTO _MemoToTag (A, B) VALUES (?, ?) ON CONFLICT(A, B) DO NOTHING;",
            args: [memo.id, tag.id],
        }))
    );

    if (relationStatements.length > 0) {
        await tx.batch(relationStatements);
    }
}

/**
 * 主同步函数
 */
async function main() {
    const startTime = Date.now();
    const currentSyncStartTime = new Date();
    console.log(`🚀 开始增量同步... (当前时间: ${currentSyncStartTime.toLocaleString()})`);

    let lastSyncTimestamp = "1970-01-01T00:00:00.000Z";
    try {
        await setupTurso(turso);
        const result = await turso.execute({
            sql: "SELECT value FROM sync_metadata WHERE key = ?;",
            args: ["last_successful_sync"],
        });
        if (result.rows.length > 0) {
            lastSyncTimestamp = result.rows[0].value as string;
        }
    } catch (error) {
        console.error("❌ 无法获取上次同步时间戳，将进行全量同步。", error);
    }

    console.log(`🕒 将同步自 ${new Date(lastSyncTimestamp).toLocaleString()} 以来的变更。`);

    // 1. 在事务之外获取所有需要处理的数据
    const memosToDelete = await prisma.memo.findMany({
        where: { deleted_at: { not: null, gt: new Date(lastSyncTimestamp) } },
    });
    const memosToSync = await prisma.memo.findMany({
        where: { updatedAt: { gt: new Date(lastSyncTimestamp) }, deleted_at: null },
        include: { tags: true, link: true },
    });

    // 如果没有任何变更，提前退出
    if (memosToDelete.length === 0 && memosToSync.length === 0) {
        console.log("✅ 没有检测到数据变更，无需同步。");
        turso.close();
        return;
    }

    // 2. 启动事务
    const tx = await turso.transaction("write");
    console.log("🔒 已启动 Turso 数据库事务。");

    try {
        // 3. 在事务中执行所有数据库写入操作

        // 3a. 处理删除
        if (memosToDelete.length > 0) {
            console.log(`🗑️ 在事务中删除 ${memosToDelete.length} 条笔记...`);
            const deleteStatements = memosToDelete.map(memo => ({
                sql: "DELETE FROM memos WHERE id = ?;",
                args: [memo.id],
            }));
            await tx.batch(deleteStatements);
        }

        // 3b. 处理新增/更新
        if (memosToSync.length > 0) {
            console.log(`🔄 正在分批处理 ${memosToSync.length} 条需要同步的笔记...`);

            // 首先，在事务中一次性同步所有标签。
            await syncAllTagsInTransaction(tx);

            for (let i = 0; i < memosToSync.length; i += BATCH_SIZE) {
                const batchMemos = memosToSync.slice(i, i + BATCH_SIZE);
                const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(memosToSync.length / BATCH_SIZE);
                console.log(`  - 批次 ${batchNumber}/${totalBatches}: 处理 ${batchMemos.length} 条笔记。`);

                console.log(`    🔄 正在为批次生成向量...`);
                const contents = batchMemos.map(memo => memo.content.trim());
                const embeddings = await getEmbeddings(contents);
                if (embeddings.length !== batchMemos.length) {
                    throw new Error(`批次 ${batchNumber} 的向量数量(${embeddings.length})与笔记数量(${batchMemos.length})不匹配`);
                }

                console.log(`    ➕ 在事务中同步批次笔记...`);
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
                await tx.batch(statements);

                console.log("    🔗 在事务中同步批次关联关系...");
                await syncMemoRelationsInTransaction(tx, batchMemos);
            }
        }

        // 4. 提交事务
        console.log("⏳ 正在提交 Turso 事务...");
        await tx.commit();
        console.log("✅ Turso 事务已成功提交。");

        // 5. 事务成功后，才更新同步时间戳
        console.log("💾 正在更新同步时间点...");
        await turso.execute({
            sql: `
                INSERT INTO sync_metadata (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            `,
            args: ["last_successful_sync", currentSyncStartTime.toISOString()],
        });
        console.log(`✅ 新的同步时间点已记录: ${currentSyncStartTime.toLocaleString()}`);

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 增量同步成功！耗时: ${duration.toFixed(2)} 秒`);

    } catch (error) {
        // 6. 如果发生任何错误，回滚事务
        console.error("\n❌ 同步过程中发生严重错误，正在回滚事务...");
        if (tx) await tx.rollback();
        console.error("⏪ 事务已回滚。");
        console.error(error);
        process.exit(1);
    } finally {
        // 7. 清理连接
        console.log("\n🔧 正在清理并关闭连接...");
        await prisma.$disconnect();
        if (!turso.closed) turso.close();
        console.log("✅ 清理完成");
    }
}

main();