import { PrismaClient } from "@prisma/client";
import { createClient, Client } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function syncMemos(turso: Client) {
    console.log("Syncing memos...");
    const memos = await prisma.memo.findMany({
        include: {
            tags: true,
            link: true,
        },
    });

    if (memos.length === 0) {
        console.log("No memos to sync.");
        return;
    }

    const memoStatements = memos.map((memo) => ({
        sql: `
      INSERT INTO memos (id, content, images, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        images = excluded.images,
        updated_at = excluded.updated_at;
    `,
        args: [
            memo.id,
            memo.content,
            JSON.stringify(memo.images), // Store images array as a JSON string
            memo.createdAt.toISOString(),
            memo.updatedAt.toISOString(),
        ],
    }));

    const linkStatements = memos
        .filter((memo) => memo.link)
        .map((memo) => {
            const link = memo.link!;
            return {
                sql: `
        INSERT INTO links (id, link, text, memo_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(memo_id) DO UPDATE SET
          link = excluded.link,
          text = excluded.text;
      `,
                args: [
                    link.id,
                    link.url,
                    link.text,
                    link.memoId,
                    link.createdAt.toISOString(),
                ],
            };
        });

    try {
        await turso.batch([...memoStatements, ...linkStatements], "write");
        console.log(`Synced ${memos.length} memos and ${linkStatements.length} links.`);
    } catch (e) {
        console.error("Failed to sync memos and links:", e);
    }
}

async function syncTags(turso: Client) {
    console.log("Syncing tags...");
    const tags = await prisma.tag.findMany();

    if (tags.length === 0) {
        console.log("No tags to sync.");
        return;
    }

    const statements = tags.map((tag) => ({
        sql: `
      INSERT INTO tags (id, name, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        name = excluded.name;
    `,
        args: [tag.id, tag.name, tag.createdAt.toISOString()],
    }));

    try {
        await turso.batch(statements, "write");
        console.log(`Synced ${tags.length} tags.`);
    } catch (e) {
        console.error("Failed to sync tags:", e);
    }
}

async function syncMemoToTagRelations(turso: Client) {
    console.log("Syncing memo-tag relations...");
    // Prisma's implicit M-M relation table is named `_MemoToTag`
    const memoTagRelations = await prisma.$queryRaw<
        { A: string; B: string }[]
    >`SELECT "A", "B" FROM "_MemoToTag"`;

    if (memoTagRelations.length === 0) {
        console.log("No memo-tag relations to sync.");
        return;
    }

    const statements = memoTagRelations.map(({ A, B }) => ({
        sql: `
      INSERT INTO _MemoToTag (A, B)
      VALUES (?, ?)
      ON CONFLICT(A, B) DO NOTHING;
    `,
        args: [A, B],
    }));

    try {
        await turso.batch(statements, "write");
        console.log(`Synced ${memoTagRelations.length} memo-tag relations.`);
    } catch (e) {
        console.error("Failed to sync memo-tag relations:", e);
    }
}

async function main() {
    try {
        await syncMemos(turso);
        await syncTags(turso);
        await syncMemoToTagRelations(turso);
        console.log("✅ Sync to Turso completed successfully.");
    } catch (e) {
        console.error("❌ An error occurred during the sync process:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
