import {
  generateEmbedding,
  parseEmbeddingFromTurso,
  calculateCosineSimilarity,
  EmbeddingServiceError,
} from '../../../../src/services/embeddingService';
import { db, client } from '../../../../src/db';
import * as schema from '../../../../src/db/schema';
import { and, eq, inArray, isNull, isNotNull, notInArray, sql } from 'drizzle-orm';

// ── 漫游参数 ──────────────────────────────────────────────
const WALK_MIN = 8; // 最短路径长度
const WALK_MAX = 12; // 最长路径长度
const TOP_K = 8; // 每跳向量近邻候选数
const NEIGHBOR_MIN_SIMILARITY = 0.3; // 近邻最低相似度，低于此视为无近邻

// 路径上的一个节点
interface WalkNode {
  id: string;
  content: string;
  createdAt: string;
  embedding: number[];
  similarityToPrev: number | null; // 与上一跳的余弦相似度，起点为 null
  isJump: boolean; // 是否为弱关联大跳
}

// 加权随机：权重正比于相似度，越近越可能但不必然，避免近似重复死循环
function weightedPick<T>(items: T[], weightOf: (item: T) => number): T {
  const weights = items.map((it) => Math.max(weightOf(it), 0.0001));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// 用 drizzle 取某条笔记的完整节点（含 embedding，schema fromDriver 已转 number[]）
async function fetchNodeById(id: string): Promise<Omit<WalkNode, 'similarityToPrev' | 'isJump'> | null> {
  const [row] = await db
    .select({
      id: schema.memos.id,
      content: schema.memos.content,
      createdAt: schema.memos.createdAt,
      embedding: schema.memos.embedding,
    })
    .from(schema.memos)
    .where(and(eq(schema.memos.id, id), isNull(schema.memos.deletedAt)));

  if (!row || !row.embedding) return null;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    embedding: row.embedding as number[],
  };
}

// 随机取一条未访问、且有 embedding 的笔记（起点 / 弱关联大跳）
async function fetchRandomNode(
  excludeIds: string[],
): Promise<Omit<WalkNode, 'similarityToPrev' | 'isJump'> | null> {
  const [row] = await db
    .select({
      id: schema.memos.id,
      content: schema.memos.content,
      createdAt: schema.memos.createdAt,
      embedding: schema.memos.embedding,
    })
    .from(schema.memos)
    .where(
      and(
        isNull(schema.memos.deletedAt),
        isNotNull(schema.memos.embedding),
        excludeIds.length > 0 ? notInArray(schema.memos.id, excludeIds) : undefined,
      ),
    )
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (!row || !row.embedding) return null;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    embedding: row.embedding as number[],
  };
}

// 对当前 embedding 做向量近邻搜索，排除已访问，返回 top-K 候选（不含 embedding）
async function findNeighbors(
  queryEmbedding: number[],
  excludeIds: string[],
): Promise<Array<{ id: string; similarity: number }>> {
  const vectorString = JSON.stringify(queryEmbedding);
  const placeholders = excludeIds.map(() => '?').join(', ');
  const notInClause = excludeIds.length > 0 ? `AND id NOT IN (${placeholders})` : '';

  const searchSQL = `
    SELECT id, vector_distance_cos(embedding, vector32(?)) AS distance
    FROM memos
    WHERE deleted_at IS NULL
      AND embedding IS NOT NULL
      ${notInClause}
    ORDER BY distance ASC
    LIMIT ?
  `;

  const result = await client.execute({
    sql: searchSQL,
    args: [vectorString, ...excludeIds, TOP_K],
  });

  return result.rows
    .map((row) => ({
      id: String(row[0]),
      similarity: 1 - Number(row[1]),
    }))
    .filter((n) => n.similarity >= NEIGHBOR_MIN_SIMILARITY);
}

// 补齐路径上每条笔记的标签
async function fetchTagsForMemos(memoIds: string[]): Promise<Record<string, string[]>> {
  if (memoIds.length === 0) return {};
  const rows = await db
    .select({
      memoId: schema.memoTags.memoId,
      name: schema.tags.name,
    })
    .from(schema.memoTags)
    .innerJoin(schema.tags, eq(schema.memoTags.tagId, schema.tags.id))
    .where(inArray(schema.memoTags.memoId, memoIds));

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    (map[r.memoId] ||= []).push(r.name);
  }
  return map;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const startMemoId: string | undefined =
      typeof body.startMemoId === 'string' ? body.startMemoId : undefined;

    // 目标长度：随机 8–12
    const targetLength =
      WALK_MIN + Math.floor(Math.random() * (WALK_MAX - WALK_MIN + 1));

    // 弱关联大跳落在中段
    const jumpAt = Math.floor(targetLength / 2);

    // ── 起点 ──────────────────────────────────────────────
    let startBase: Omit<WalkNode, 'similarityToPrev' | 'isJump'> | null = null;
    if (startMemoId) {
      startBase = await fetchNodeById(startMemoId);
      // 起点缺 embedding：临时生成，不阻塞
      if (!startBase) {
        const [raw] = await db
          .select({
            id: schema.memos.id,
            content: schema.memos.content,
            createdAt: schema.memos.createdAt,
          })
          .from(schema.memos)
          .where(and(eq(schema.memos.id, startMemoId), isNull(schema.memos.deletedAt)));
        if (raw && raw.content?.trim()) {
          const emb = await generateEmbedding(raw.content);
          startBase = { ...raw, embedding: emb };
        }
      }
    }
    if (!startBase) {
      startBase = await fetchRandomNode([]);
    }

    if (!startBase) {
      return Response.json(
        { error: '没有可漫游的笔记（需要至少一条带向量的笔记）' },
        { status: 404 },
      );
    }

    // ── 链式游走 ──────────────────────────────────────────
    const path: WalkNode[] = [
      { ...startBase, similarityToPrev: null, isJump: false },
    ];
    const visited = new Set<string>([startBase.id]);

    while (path.length < targetLength) {
      const current = path[path.length - 1];
      const excludeIds = Array.from(visited);
      const forceJump = path.length === jumpAt;

      let nextBase: Omit<WalkNode, 'similarityToPrev' | 'isJump'> | null = null;
      let isJump = false;

      if (!forceJump) {
        const neighbors = await findNeighbors(current.embedding, excludeIds);
        if (neighbors.length > 0) {
          const picked = weightedPick(neighbors, (n) => n.similarity);
          nextBase = await fetchNodeById(picked.id);
        }
      }

      // 强制大跳，或近邻枯竭 → 随机跳
      if (!nextBase) {
        nextBase = await fetchRandomNode(excludeIds);
        isJump = true;
      }

      if (!nextBase) break; // 笔记不够，提前结束

      const similarity = calculateCosineSimilarity(
        current.embedding,
        nextBase.embedding,
      );
      path.push({ ...nextBase, similarityToPrev: similarity, isJump });
      visited.add(nextBase.id);
    }

    // ── 标签 ──────────────────────────────────────────────
    const tagMap = await fetchTagsForMemos(path.map((n) => n.id));

    // ── 最大跳跃点：相似度最低的一跳 ────────────────────────
    let biggestJumpIndex = -1;
    let minSim = Infinity;
    for (let i = 1; i < path.length; i++) {
      const s = path[i].similarityToPrev ?? Infinity;
      if (s < minSim) {
        minSim = s;
        biggestJumpIndex = i;
      }
    }

    const totalChars = path.reduce((sum, n) => sum + (n.content?.length || 0), 0);

    return Response.json({
      path: path.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        tags: tagMap[n.id] || [],
        similarityToPrev: n.similarityToPrev,
        isJump: n.isJump,
      })),
      meta: {
        totalChars,
        biggestJumpIndex,
        length: path.length,
      },
      processingTime: (Date.now() - startTime) / 1000,
    });
  } catch (error: any) {
    if (error instanceof EmbeddingServiceError) {
      console.error('❌ 漫游 embedding 错误:', error.code, error.message);
    } else {
      console.error('❌ 漫游失败:', error?.message);
    }
    return Response.json(
      { error: error?.message || '漫游时发生未知错误' },
      { status: 500 },
    );
  }
}
