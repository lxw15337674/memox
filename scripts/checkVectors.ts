import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkVectors() {
    try {
        console.log("🔍 检查向量数据...");
        
        // 检查表结构
        const tableInfo = await turso.execute("PRAGMA table_info(memos)");
        console.log("📊 表结构:");
        tableInfo.rows.forEach(row => {
            if (row[1] === 'embedding') {
                console.log(`  - embedding列类型: ${row[2]}`);
            }
        });
        
        // 检查向量数据
        const vectorData = await turso.execute(`
            SELECT id, 
                   embedding IS NOT NULL as has_embedding,
                   typeof(embedding) as type,
                   LENGTH(embedding) as length
            FROM memos 
            LIMIT 10
        `);
        
        console.log("\n📊 向量数据样本:");
        vectorData.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ID: ${(row[0] as string).substring(0, 8)}..., Has Embedding: ${row[1]}, Type: ${row[2]}, Length: ${row[3]}`);
        });
        
        // 尝试检查一个具体的向量
        const sampleVector = await turso.execute(`
            SELECT id, embedding 
            FROM memos 
            WHERE embedding IS NOT NULL 
            LIMIT 1
        `);
        
        if (sampleVector.rows.length > 0) {
            console.log("\n🧪 样本向量分析:");
            const id = sampleVector.rows[0][0] as string;
            const embedding = sampleVector.rows[0][1];
            console.log(`  - ID: ${id.substring(0, 8)}...`);
            console.log(`  - Embedding type: ${typeof embedding}`);
            console.log(`  - Embedding value: ${embedding ? "存在" : "空值"}`);
        }
        
    } catch (error) {
        console.error("❌ 检查失败:", error);
    } finally {
        turso.close();
    }
}

checkVectors();
