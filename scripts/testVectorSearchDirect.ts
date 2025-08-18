import { createClient } from "@libsql/client";
import { generateEmbedding } from "../src/services/embeddingService";
import dotenv from "dotenv";

dotenv.config();

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function testVectorSearchDirectly() {
    try {
        console.log("🔍 直接测试向量搜索功能...");
        
        // 1. 检查有多少条记录有embedding
        const countResult = await turso.execute(`
            SELECT 
                COUNT(*) as total_memos,
                COUNT(embedding) as memos_with_embedding,
                SUM(CASE WHEN LENGTH(embedding) > 0 THEN 1 ELSE 0 END) as memos_with_valid_embedding
            FROM memos 
            WHERE deleted_at IS NULL
        `);
        
        console.log("📊 数据库统计:");
        console.log(`  - 总memo数: ${countResult.rows[0][0]}`);
        console.log(`  - 有embedding的memo数: ${countResult.rows[0][1]}`);
        console.log(`  - 有效embedding数: ${countResult.rows[0][2]}`);
        
        // 2. 查看一些memo的内容样本
        const sampleMemos = await turso.execute(`
            SELECT id, SUBSTR(content, 1, 100) as content_preview, LENGTH(embedding) as embedding_length
            FROM memos 
            WHERE deleted_at IS NULL AND embedding IS NOT NULL
            LIMIT 5
        `);
        
        console.log("\n📝 memo内容样本:");
        sampleMemos.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ID: ${(row[0] as string).substring(0, 8)}...`);
            console.log(`     内容: ${row[1]}...`);
            console.log(`     Embedding长度: ${row[2]} 字节`);
            console.log("");
        });
        
        // 3. 测试具体的向量搜索
        console.log("🧠 生成查询向量...");
        const testQuery = "共识";
        const queryEmbedding = await generateEmbedding(testQuery);
        const vectorString = JSON.stringify(queryEmbedding);
        
        console.log(`✅ 查询"${testQuery}"的embedding生成成功`);
        
        // 4. 执行向量搜索，不设置阈值，查看所有结果
        console.log("🔍 执行向量相似度搜索...");
        
        const vectorSearchSQL = `
            SELECT 
                id,
                SUBSTR(content, 1, 150) as content_preview,
                created_at,
                vector_distance_cos(embedding, vector32(?)) as distance
            FROM memos 
            WHERE 
                deleted_at IS NULL 
                AND embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT 10
        `;
        
        const searchResult = await turso.execute({
            sql: vectorSearchSQL,
            args: [vectorString]
        });
        
        console.log(`\n🎯 向量搜索结果 (查询: "${testQuery}"):`);
        console.log(`找到 ${searchResult.rows.length} 条结果:`);
        
        searchResult.rows.forEach((row, index) => {
            const id = row[0] as string;
            const content = row[1] as string;
            const created_at = row[2] as string;
            const distance = row[3] as number;
            const similarity = 1 - distance;
            
            console.log(`\n${index + 1}. ID: ${id.substring(0, 8)}...`);
            console.log(`   相似度: ${similarity.toFixed(4)} (距离: ${distance.toFixed(4)})`);
            console.log(`   创建时间: ${created_at}`);
            console.log(`   内容预览: ${content}...`);
        });
        
        // 5. 检查阈值问题
        const SIMILARITY_THRESHOLD = 0.4;
        const validResults = searchResult.rows.filter(row => {
            const distance = row[3] as number;
            return distance <= SIMILARITY_THRESHOLD;
        });
        
        console.log(`\n📏 阈值分析 (阈值: ${SIMILARITY_THRESHOLD}):`);
        console.log(`  - 原始结果: ${searchResult.rows.length} 条`);
        console.log(`  - 通过阈值筛选: ${validResults.length} 条`);
        
        if (validResults.length === 0 && searchResult.rows.length > 0) {
            const minDistance = Math.min(...searchResult.rows.map(row => row[3] as number));
            console.log(`  - 最小距离: ${minDistance.toFixed(4)} (相似度: ${(1-minDistance).toFixed(4)})`);
            console.log(`  - 建议调整阈值至: ${(minDistance + 0.1).toFixed(2)} 或更高`);
        }
        
    } catch (error) {
        console.error("❌ 向量搜索测试失败:", error);
    } finally {
        turso.close();
    }
}

testVectorSearchDirectly();
