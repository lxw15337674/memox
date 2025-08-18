import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { createClient } from "@libsql/client";
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from "../src/db/schema";
import dotenv from "dotenv";

dotenv.config();

// === 配置 ===
const BATCH_SIZE = 100; // 每批处理的memo数量（不生成embedding，可以增加批次大小）
const MAX_MEMOS_TO_MIGRATE = 100; // 最大迁移memo数量（测试用）

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
console.log(`⚠️ 注意: 此次迁移只同步 ${MAX_MEMOS_TO_MIGRATE} 条memo数据（测试模式）`);
console.log("⚠️ 注意: 此次迁移不生成embedding，可后续通过异步任务生成");
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
 * 迁移笔记（分批处理，不生成embedding）
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
    
    // 分批处理
    for (let i = 0; i < prismaMemosData.length; i += BATCH_SIZE) {
        const batchMemos = prismaMemosData.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`  📦 批次 ${batchNumber}/${totalBatches}: 处理 ${batchMemos.length} 条笔记`);
        
        // 准备memo数据（embedding字段设为null）
        const memosToInsert = batchMemos.map(memo => ({
            id: memo.id, // 保持原有ID
            content: memo.content,
            images: JSON.stringify(memo.images || []),
            createdAt: memo.createdAt.toISOString(),
            updatedAt: memo.updatedAt.toISOString(),
            deletedAt: memo.deleted_at?.toISOString() || null,
            embedding: null, // 不生成embedding，后续可通过异步任务生成
        }));
        
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
    
    console.log(`✅ 所有笔记迁移完成（embedding将在后续生成）`);
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
            value: "full_migration_from_prisma_without_embeddings"
        },
        {
            key: "embeddings_generated",
            value: "false"
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
        
        // 6. 设置同步元数据
        await setSyncMetadata();
        
        // 7. 验证迁移结果
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
            console.log("  3. 🔄 后续生成embedding：");
            console.log("     - 新创建的memo会自动生成embedding");
            console.log("     - 可运行异步任务为历史memo生成embedding");
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
