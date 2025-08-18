import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { createClient } from "@libsql/client";
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from "../src/db/schema";
import { generateEmbedding } from "../src/services/embeddingService";
import dotenv from "dotenv";

dotenv.config();

// === 配置 ===
const BATCH_SIZE = 20; // 每批处理的memo数量（生成embedding需要API调用，减少批次大小）
const MAX_MEMOS_TO_MIGRATE = 20; // 最大迁移memo数量（测试用）
const EMBEDDING_DELAY = 100; // 每次embedding生成后的延迟(ms)，避免API限流

// === 客户端初始化 ===
const prisma = new PrismaClient().$extends(withAccelerate());

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(turso, { schema });

// === 环境检查 ===
console.log("🔧 环境配置检查：");
console.log("- Prisma DATABASE_URL:", process.env.DATABASE_URL ? "✅ 已设置" : "❌ 未设置");
console.log("- Turso DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✅ 已设置" : "❌ 未设置");
console.log("- Turso AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "✅ 已设置" : "❌ 未设置");
console.log("- SILICONFLOW_API_KEY:", process.env.SILICONFLOW_API_KEY ? "✅ 已设置" : "❌ 未设置");
console.log(`⚠️ 注意: 此次迁移只同步 ${MAX_MEMOS_TO_MIGRATE} 条memo数据（测试模式）`);
console.log("✨ 新特性: 此次迁移将为每个memo生成embedding向量");
console.log("");

/**
 * 清理目标数据库
 */
async function clearTursoDatabase() {
    console.log("🧹 清理Turso数据库...");
    try {
        await db.delete(schema.memoTags);
        await db.delete(schema.links);
        await db.delete(schema.memos);
        await db.delete(schema.tags);
        await db.delete(schema.syncMetadata);
        console.log("✅ Turso数据库清理完成");
    } catch (error) {
        console.error("❌ 清理数据库失败:", error);
        throw error;
    }
}

/**
 * 迁移标签
 */
async function migrateTags() {
    console.log("🏷️ 开始迁移标签...");
    
    const prismaTagsData = await prisma.tag.findMany({
        orderBy: { createdAt: 'desc' }
    });
    
    if (prismaTagsData.length === 0) {
        console.log("📄 没有标签需要迁移");
        return [];
    }

    const tagsToInsert = prismaTagsData.map(tag => ({
        id: tag.id, // 保持原有ID
        name: tag.name,
        createdAt: tag.createdAt.toISOString(),
    }));
    
    await db.insert(schema.tags).values(tagsToInsert);
    console.log(`✅ 已迁移 ${prismaTagsData.length} 个标签`);
    
    return prismaTagsData;
}

/**
 * 迁移链接
 */
async function migrateLinks() {
    console.log("🔗 开始迁移链接...");
    const prismaLinksData = await prisma.link.findMany({
        orderBy: { createdAt: 'desc' }
    });
    
    if (prismaLinksData.length === 0) {
        console.log("📄 没有链接需要迁移");
        return [];
    }

    const linksToInsert = prismaLinksData.map(link => ({
        id: link.id, // 保持原有ID
        link: link.url,
        text: link.text,
        memoId: link.memoId, // 保持原有关联
        createdAt: link.createdAt.toISOString(),
    }));
    
    await db.insert(schema.links).values(linksToInsert);
    console.log(`✅ 已迁移 ${prismaLinksData.length} 个链接`);
    
    return prismaLinksData;
}

/**
 * 生成memo embedding的辅助函数（适配新的 vector32() 函数）
 */
async function generateMemoEmbedding(content: string): Promise<number[] | null> {
    try {
        console.log(`    🧠 生成embedding...`);
        const embedding = await generateEmbedding(content);
        
        // 添加延迟避免API限流
        if (EMBEDDING_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY));
        }
        
        return embedding; // 直接返回数组，新的 schema 会处理转换
    } catch (error) {
        console.error(`    ❌ 生成embedding失败:`, error);
        return null; // 如果embedding生成失败，返回null，不影响整体迁移
    }
}

/**
 * 迁移笔记（分批处理，生成embedding）
 */
async function migrateMemos() {
    console.log("� 开始迁移笔记（不生成embedding）...");
    // 只迁移未删除的memo
    const prismaMemosData = await prisma.memo.findMany({
        where: { deleted_at: null },
        include: { tags: true, link: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_MEMOS_TO_MIGRATE
    });

    if (prismaMemosData.length === 0) {
        console.log("📄 没有笔记需要迁移");
        return { memos: [], memoTagRelations: [] };
    }

    console.log(`📊 总共需要迁移 ${prismaMemosData.length} 条笔记`);
    
    const totalBatches = Math.ceil(prismaMemosData.length / BATCH_SIZE);
    const allMemoTagRelations: { memoId: string; tagId: string }[] = [];
    let embeddingSuccessCount = 0;
    let embeddingFailCount = 0;
    
    // 分批处理
    for (let i = 0; i < prismaMemosData.length; i += BATCH_SIZE) {
        const batchMemos = prismaMemosData.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`  📦 批次 ${batchNumber}/${totalBatches}: 处理 ${batchMemos.length} 条笔记`);
        
        // 为每个memo生成embedding和准备数据
        const memosToInsert = [];
        for (const memo of batchMemos) {
            console.log(`    📝 处理memo: ${memo.id.substring(0, 8)}...`);
            
            // 生成embedding
            const embeddingArray = await generateMemoEmbedding(memo.content);
            if (embeddingArray) {
                embeddingSuccessCount++;
                console.log(`    ✅ embedding生成成功`);
            } else {
                embeddingFailCount++;
                console.log(`    ⚠️ embedding生成失败，将继续迁移`);
            }
            
            memosToInsert.push({
                id: memo.id, // 保持原有ID
                content: memo.content,
                images: JSON.stringify(memo.images || []),
                createdAt: memo.createdAt.toISOString(),
                updatedAt: memo.updatedAt.toISOString(),
                deletedAt: memo.deleted_at?.toISOString() || null,
                embedding: embeddingArray, // 直接传入数组，schema会处理转换
            });
        }
        
        // 插入memo数据
        await db.insert(schema.memos).values(memosToInsert);
        
        // 收集memo-tag关系
        for (const memo of batchMemos) {
            for (const tag of memo.tags) {
                allMemoTagRelations.push({
                    memoId: memo.id,
                    tagId: tag.id,
                });
            }
        }
        
        console.log(`    ✅ 批次 ${batchNumber} 完成`);
    }
    
    console.log(`✅ 所有笔记迁移完成`);
    console.log(`📊 Embedding统计: 成功 ${embeddingSuccessCount}, 失败 ${embeddingFailCount}`);
    return { memos: prismaMemosData, memoTagRelations: allMemoTagRelations };
}

/**
 * 迁移memo-tag关系
 */
async function migrateMemoTagRelations(relations: { memoId: string; tagId: string }[]) {
    if (relations.length === 0) {
        console.log("📄 没有memo-tag关系需要迁移");
        return;
    }
    
    console.log(`🔗 开始迁移 ${relations.length} 个memo-tag关系...`);
    
    // 分批插入关系数据
    const batchSize = 500;
    for (let i = 0; i < relations.length; i += batchSize) {
        const batch = relations.slice(i, i + batchSize);
        await db.insert(schema.memoTags).values(batch);
    }
    
    console.log(`✅ memo-tag关系迁移完成`);
}

/**
 * 创建向量索引（真正的混合方案 - 重新生成embedding）
 */
async function createVectorIndex() {
    console.log("🔗 创建向量索引...");
    
    try {
        // 检查表是否已经有正确的向量类型
        console.log("  📝 检查表结构...");
        const tableInfo = await turso.execute("PRAGMA table_info(memos)");
        const embeddingColumn = tableInfo.rows.find(row => row[1] === 'embedding');
        
        if (embeddingColumn) {
            console.log(`  📊 当前embedding列类型: ${embeddingColumn[2]}`);
            
            // 如果类型不是F32_BLOB，需要重建表
            if (embeddingColumn[2] !== 'F32_BLOB(2560)') {
                console.log("  ⚠️ 发现embedding列类型不正确，需要重建表...");
                await rebuildTableWithCorrectVectorType();
            } else {
                // 检查是否需要重新生成 embedding
                const vectorCheck = await turso.execute("SELECT COUNT(*) as count, SUM(LENGTH(embedding)) as total_length FROM memos WHERE embedding IS NOT NULL");
                const count = vectorCheck.rows[0][0] as number;
                const totalLength = vectorCheck.rows[0][1] as number;
                
                if (count > 0 && (totalLength === 0 || totalLength < count * 1000)) {
                    console.log(`  ⚠️ 发现向量数据损坏 (${count} 条记录，总长度 ${totalLength})，需要重新生成...`);
                    await regenerateEmbeddings();
                }
            }
        }
        
        // 现在创建向量索引
        console.log("  📝 创建向量索引...");
        await turso.execute("CREATE INDEX IF NOT EXISTS memos_embedding_idx ON memos (libsql_vector_idx(embedding))");
        console.log("✅ 向量索引创建完成");
        
        // 验证索引是否创建成功
        const indexResult = await turso.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='memos_embedding_idx'");
        if (indexResult.rows.length > 0) {
            console.log("✅ 向量索引验证成功");
            
            // 测试向量搜索功能
            console.log("  🧪 测试向量搜索功能...");
            const testResult = await turso.execute(`
                SELECT id, vector_distance_cos(embedding, vector32('[${new Array(2560).fill(0.1).join(',')}]')) as distance 
                FROM memos 
                WHERE embedding IS NOT NULL 
                LIMIT 3
            `);
            
            if (testResult.rows.length > 0) {
                console.log(`✅ 向量搜索测试成功，找到 ${testResult.rows.length} 条记录`);
                testResult.rows.forEach((row, index) => {
                    console.log(`    ${index + 1}. ID: ${(row[0] as string).substring(0, 8)}..., Distance: ${row[1]}`);
                });
            } else {
                console.log("⚠️ 向量搜索测试未找到记录（可能是没有embedding数据）");
            }
        } else {
            console.log("⚠️ 向量索引验证失败");
        }
        
    } catch (error) {
        console.error("❌ 创建向量索引失败:", error);
        console.log("⚠️ 向量搜索可能无法正常工作，但不影响其他功能");
        
        // 如果索引创建失败，提供调试信息
        try {
            const embeddingData = await turso.execute("SELECT id, typeof(embedding) as type, LENGTH(embedding) as length FROM memos WHERE embedding IS NOT NULL LIMIT 3");
            console.log("🔍 调试信息 - embedding数据状态:", embeddingData.rows);
        } catch (debugError) {
            console.log("🔍 无法获取调试信息:", debugError);
        }
    }
}

/**
 * 重建表结构以使用正确的向量类型
 */
async function rebuildTableWithCorrectVectorType() {
    console.log("  📝 重建表以使用正确的向量类型...");
    
    // 创建带有正确向量类型的新表
    await turso.execute(`
        CREATE TABLE memos_new (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            images TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            embedding F32_BLOB(2560)
        )
    `);
    
    // 复制基础数据（不包括embedding）
    await turso.execute(`
        INSERT INTO memos_new (id, content, images, created_at, updated_at, deleted_at, embedding)
        SELECT id, content, images, created_at, updated_at, deleted_at, NULL
        FROM memos
    `);
    
    // 删除旧表并重命名新表
    await turso.execute("DROP TABLE memos");
    await turso.execute("ALTER TABLE memos_new RENAME TO memos");
    
    console.log("  ✅ 表重建完成，现在使用正确的 F32_BLOB(2560) 类型");
    
    // 重新生成 embedding
    await regenerateEmbeddings();
}

/**
 * 重新生成 embedding 数据
 */
async function regenerateEmbeddings() {
    console.log("  🧠 重新生成 embedding 数据...");
    
    // 获取所有需要生成 embedding 的记录
    const memosToProcess = await turso.execute("SELECT id, content FROM memos WHERE embedding IS NULL OR LENGTH(embedding) = 0");
    
    console.log(`  📊 需要生成 embedding 的记录数: ${memosToProcess.rows.length}`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const row of memosToProcess.rows) {
        const id = row[0] as string;
        const content = row[1] as string;
        
        try {
            console.log(`    🧠 为 ${id.substring(0, 8)}... 生成embedding`);
            
            // 生成 embedding
            const embedding = await generateEmbedding(content);
            const vectorString = JSON.stringify(embedding);
            
            // 使用 vector32() 函数插入
            await turso.execute({
                sql: "UPDATE memos SET embedding = vector32(?) WHERE id = ?",
                args: [vectorString, id]
            });
            
            successCount++;
            
            // 添加延迟避免API限流
            if (EMBEDDING_DELAY > 0) {
                await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY));
            }
            
        } catch (error) {
            console.error(`    ❌ 为 ${id.substring(0, 8)}... 生成embedding失败:`, error);
            failCount++;
        }
    }
    
    console.log(`  ✅ Embedding 重新生成完成: 成功 ${successCount}, 失败 ${failCount}`);
}

/**
 * 设置同步元数据
 */
async function setSyncMetadata() {
    console.log("💾 设置同步元数据...");
    
    const now = new Date().toISOString();
    
    await db.insert(schema.syncMetadata).values([
        {
            key: "last_successful_sync",
            value: now,
        },
        {
            key: "migration_completed",
            value: now,
        },
        {
            key: "migration_type",
            value: "full_migration_from_prisma_with_embeddings"
        },
        {
            key: "embeddings_generated",
            value: "true"
        }
    ]);
    
    console.log("✅ 同步元数据设置完成");
}

/**
 * 数据验证
 */
async function validateMigration() {
    console.log("🔍 验证迁移结果...");
    
    try {
        // 验证Prisma数据量
        const [prismaTagCount, prismaMemoCount, prismaLinkCount] = await Promise.all([
            prisma.tag.count(),
            prisma.memo.count({ where: { deleted_at: null } }),
            prisma.link.count()
        ]);
        
        // 验证Turso数据量
        const [tursoTagResult, tursoMemoResult, tursoLinkResult, tursoRelationResult] = await Promise.all([
            db.select({ count: schema.tags.id }).from(schema.tags),
            db.select({ count: schema.memos.id }).from(schema.memos),
            db.select({ count: schema.links.id }).from(schema.links),
            db.select({ count: schema.memoTags.memoId }).from(schema.memoTags)
        ]);
        
        const tursoTagCount = tursoTagResult.length;
        const tursoMemoCount = tursoMemoResult.length;
        const tursoLinkCount = tursoLinkResult.length;
        const tursoRelationCount = tursoRelationResult.length;
        
        console.log("📊 数据量对比：");
        console.log(`  - 标签: Prisma ${prismaTagCount} → Turso ${tursoTagCount} ${prismaTagCount === tursoTagCount ? '✅' : '❌'}`);
        console.log(`  - 笔记: Prisma ${prismaMemoCount} → Turso ${tursoMemoCount} ${prismaMemoCount === tursoMemoCount ? '✅' : '❌'}`);
        console.log(`  - 链接: Prisma ${prismaLinkCount} → Turso ${tursoLinkCount} ${prismaLinkCount === tursoLinkCount ? '✅' : '❌'}`);
        console.log(`  - 关系: Turso ${tursoRelationCount} 条`);
        
        const isValid = prismaTagCount === tursoTagCount && 
                       prismaMemoCount === tursoMemoCount && 
                       prismaLinkCount === tursoLinkCount;
        
        if (isValid) {
            console.log("✅ 数据验证通过");
        } else {
            console.log("❌ 数据验证失败，请检查迁移过程");
        }
        
        return isValid;
    } catch (error) {
        console.error("❌ 数据验证过程出错:", error);
        return false;
    }
}

/**
 * 主迁移函数
 */
async function main() {
    const startTime = Date.now();
    console.log("🚀 开始完整数据迁移...");
    console.log(`📅 开始时间: ${new Date().toLocaleString()}`);
    
    try {
        // 1. 清理目标数据库
        await clearTursoDatabase();
        
        // 2. 迁移标签
        const tags = await migrateTags();
        
        // 3. 迁移笔记（不生成embedding）
        const { memos, memoTagRelations } = await migrateMemos();
        
        // 4. 迁移链接
        const links = await migrateLinks();
        
        // 5. 迁移memo-tag关系
        await migrateMemoTagRelations(memoTagRelations);
        
        // 6. 创建向量索引
        await createVectorIndex();
        
        // 7. 设置同步元数据
        await setSyncMetadata();
        
        // 8. 验证迁移结果
        const isValid = await validateMigration();
        
        const duration = (Date.now() - startTime) / 1000;
        
        console.log(`\n🎉 数据迁移完成！`);
        console.log(`⏱️ 总耗时: ${duration.toFixed(2)} 秒`);
        console.log(`📊 迁移统计:`);
        console.log(`  - 标签: ${tags.length}`);
        console.log(`  - 笔记: ${memos.length}`);
        console.log(`  - 链接: ${links.length}`);
        console.log(`  - 关系: ${memoTagRelations.length}`);
        console.log(`✅ 验证状态: ${isValid ? '通过' : '失败'}`);
        
        if (!isValid) {
            console.log("\n⚠️ 注意: 数据验证未通过，请检查迁移结果");
        }
        
    } catch (error) {
        console.error("\n❌ 迁移过程中发生错误:", error);
        throw error;
    } finally {
        // 清理连接
        console.log("\n🔧 正在清理连接...");
        await prisma.$disconnect();
        turso.close();
        console.log("✅ 连接清理完成");
    }
}

// 运行迁移
if (require.main === module) {
    main()
        .then(() => {
            console.log("\n🎊 迁移脚本执行完成");
            console.log("📝 接下来的步骤:");
            console.log("  1. 验证应用连接到Turso数据库正常");
            console.log("  2. 测试核心功能（创建、查看、编辑memo）");
            console.log("  3. ✅ Embedding已生成：");
            console.log("     - 迁移过程中已为历史memo生成embedding");
            console.log("     - 新创建的memo会继续自动生成embedding");
            console.log("     - 可以测试AI搜索和相关功能");
            console.log("  4. 如果一切正常，可以停用Prisma数据库");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 迁移脚本执行失败:", error);
            console.log("\n🔄 可以尝试的恢复步骤:");
            console.log("  1. 检查网络连接");
            console.log("  2. 检查Turso数据库连接");
            console.log("  3. 重新运行迁移脚本");
            process.exit(1);
        });
}

export { main as migrateAllData };
