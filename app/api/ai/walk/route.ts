import {
  generateEmbedding,
  EmbeddingServiceError,
} from '../../../../src/services/embeddingService';
import { db, client } from '../../../../src/db';
import * as schema from '../../../../src/db/schema';
import { and, eq, inArray, isNull, isNotNull, notInArray, sql } from 'drizzle-orm';

// ── 漫游参数 ──────────────────────────────────────────────
const WALK_MIN = 8; // 最少节点数
const WALK_MAX = 12; // 最多节点数
const TOP_K = 8; // 每节点向量近邻候选数
const NEIGHBOR_MIN_SIMILARITY = 0.3; // 子节点最低相似度
const CHILD_MIN = 2; // 每节点最少子节点
const CHILD_MAX = 3; // 每节点最多子节点

// 树节点（服务端内部，含 embedding）
interface TreeNode {
  id: string;
  content: string;
  createdAt: string;
  embedding: number[];
  parentIndex: number; // 根为 -1
  depth: number;
  similarityToParent: number | null; // 根为 null
}

type NodeBase = Pick<TreeNode, 'id' | 'content' | 'createdAt' | 'embedding'>;

// 用 drizzle 取某条笔记（含 embedding，schema fromDriver 已转 number[]）
async function fetchNodeById(id: string): Promise<NodeBase | null> {
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

// 随机取一条未访问、且有 embedding 的笔记（起点）
async function fetchRandomNode(excludeIds: string[]): Promise<NodeBase | null> {
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

// 向量近邻搜索，排除已访问，返回 top-K（按相似度降序，含相似度）
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

// 补齐每条笔记的标签
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

    const target =
      WALK_MIN + Math.floor(Math.random() * (WALK_MAX - WALK_MIN + 1));

    // ── 根节点 ────────────────────────────────────────────
    let rootBase: NodeBase | null = null;
    if (startMemoId) {
      rootBase = await fetchNodeById(startMemoId);
      // 起点缺 embedding：临时生成
      if (!rootBase) {
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
          rootBase = { ...raw, embedding: emb };
        }
      }
    }
    if (!rootBase) rootBase = await fetchRandomNode([]);

    if (!rootBase) {
      return Response.json(
        { error: '没有可漫游的笔记（需要至少一条带向量的笔记）' },
        { status: 404 },
      );
    }

    // ── BFS 关联树展开 ────────────────────────────────────
    const nodes: TreeNode[] = [
      { ...rootBase, parentIndex: -1, depth: 0, similarityToParent: null },
    ];
    const visited = new Set<string>([rootBase.id]);
    const queue: number[] = [0];

    while (queue.length > 0 && nodes.length < target) {
      const ci = queue.shift()!;
      const cur = nodes[ci];
      const neighbors = await findNeighbors(cur.embedding, Array.from(visited));
      if (neighbors.length === 0) continue;

      const remaining = target - nodes.length;
      const wanted = CHILD_MIN + Math.floor(Math.random() * (CHILD_MAX - CHILD_MIN + 1));
      const childN = Math.min(wanted, neighbors.length, remaining);

      for (let k = 0; k < childN; k++) {
        const nb = neighbors[k];
        const base = await fetchNodeById(nb.id);
        if (!base) continue;
        const idx = nodes.length;
        nodes.push({
          ...base,
          parentIndex: ci,
          depth: cur.depth + 1,
          similarityToParent: nb.similarity,
        });
        visited.add(base.id);
        queue.push(idx);
        if (nodes.length >= target) break;
      }
    }

    // ── 标签 ──────────────────────────────────────────────
    const tagMap = await fetchTagsForMemos(nodes.map((n) => n.id));

    // ── 统计：最弱一跳 / 最深叶 ────────────────────────────
    const hasChild = new Array(nodes.length).fill(false);
    for (const n of nodes) if (n.parentIndex >= 0) hasChild[n.parentIndex] = true;

    let weakestIndex = -1;
    let minSim = Infinity;
    let deepestLeafIndex = 0;
    let maxDepth = -1;
    for (let i = 1; i < nodes.length; i++) {
      const s = nodes[i].similarityToParent ?? Infinity;
      if (s < minSim) {
        minSim = s;
        weakestIndex = i;
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      if (hasChild[i]) continue; // 只看叶子
      const d = nodes[i].depth;
      if (d > maxDepth || (d === maxDepth && (nodes[i].similarityToParent ?? 1) < (nodes[deepestLeafIndex].similarityToParent ?? 1))) {
        maxDepth = d;
        deepestLeafIndex = i;
      }
    }

    const totalChars = nodes.reduce((sum, n) => sum + (n.content?.length || 0), 0);

    return Response.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        tags: tagMap[n.id] || [],
        parentIndex: n.parentIndex,
        depth: n.depth,
        similarityToParent: n.similarityToParent,
      })),
      meta: {
        totalChars,
        length: nodes.length,
        weakestIndex,
        deepestLeafIndex,
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
