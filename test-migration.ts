import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { drizzle } from 'drizzle-orm/libsql';
import dotenv from "dotenv";

dotenv.config();

async function testConnections() {
    console.log("🔧 测试连接...");
    
    try {
        // 测试 Prisma 连接
        console.log("1. 测试 Prisma 连接...");
        const prisma = new PrismaClient();
        const tagCount = await prisma.tag.count();
        console.log(`✅ Prisma 连接成功，标签数量: ${tagCount}`);
        await prisma.$disconnect();
        
        // 测试 Turso 连接
        console.log("2. 测试 Turso 连接...");
        const turso = createClient({
            url: process.env.TURSO_DATABASE_URL!,
            authToken: process.env.TURSO_AUTH_TOKEN!,
        });
        
        const db = drizzle(turso);
        const result = await db.run('SELECT 1 as test');
        console.log(`✅ Turso 连接成功`);
        turso.close();
        
        console.log("🎉 所有连接测试通过");
        
    } catch (error) {
        console.error("❌ 连接测试失败:", error);
        throw error;
    }
}

testConnections()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
