import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { client } from '../../../../src/db';
import { generateEmbedding } from '../../../../src/services/embeddingService';

export const maxDuration = 60;

// 每轮 RAG 检索的候选笔记数量
const TOP_K = 15;
// 向量距离阈值（余弦距离，越小越相关）
const DISTANCE_THRESHOLD = 0.8;

// StepFun（OpenAI 兼容）供应商
const provider = createOpenAICompatible({
  name: 'stepfun',
  baseURL: process.env.AI_BASE_URL || 'https://api.stepfun.com/v1',
  apiKey: process.env.AI_API_KEY || process.env.SILICONFLOW_API_KEY || '',
});

const CHAT_MODEL = process.env.AI_MODEL || 'step-3.7-flash';

interface ChatSource {
  id: string;
  content: string;
  preview: string;
  createdAt: string | null;
  displayDate: string;
  distance: number;
}

// 从 UIMessage 中提取纯文本
function getMessageText(message: UIMessage | undefined): string {
  if (!message) return '';
  return (message.parts || [])
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

// 基于查询向量检索相关笔记
async function retrieveRelevantMemos(query: string): Promise<ChatSource[]> {
  if (!query) return [];

  try {
    const embedding = await generateEmbedding(query);
    const vectorString = JSON.stringify(embedding);

    const sql = `
      SELECT id, content, created_at,
        vector_distance_cos(embedding, vector32(?)) as distance
      FROM memos
      WHERE deleted_at IS NULL
        AND embedding IS NOT NULL
        AND vector_distance_cos(embedding, vector32(?)) < ?
      ORDER BY distance ASC
      LIMIT ?
    `;

    const result = await client.execute({
      sql,
      args: [vectorString, vectorString, DISTANCE_THRESHOLD, TOP_K],
    });

    return result.rows.map((row) => {
      const content = String(row[1] ?? '');
      const createdAt = row[2] ? String(row[2]) : null;
      return {
        id: String(row[0]),
        content,
        preview: content.length > 150 ? content.slice(0, 150) + '...' : content,
        createdAt,
        displayDate: createdAt
          ? new Date(createdAt).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '未知日期',
        distance: Number(row[3]),
      };
    });
  } catch (error) {
    console.error('[chat] 向量检索失败:', error);
    return [];
  }
}

function buildSystemPrompt(sources: ChatSource[]): string {
  const notes =
    sources.length > 0
      ? sources
          .map(
            (s, i) =>
              `[${i + 1}] (ID: ${s.id}, ${s.displayDate})\n${s.content}`,
          )
          .join('\n\n')
      : '（本轮没有检索到明显相关的笔记，可基于对话上下文自然作答。）';

  return `你是用户的专属笔记对话伙伴，读过用户在这款笔记应用里记录的内容。你的任务不是通用助手，而是"读过用户笔记的 AI"：结合下面检索到的相关笔记，像一位熟悉用户的朋友那样与其对话——帮他回顾、思考、串联、发现自己没察觉的线索。

## 相关笔记（本轮检索）
${notes}

## 原则
1. 优先基于用户真实笔记作答，可自然引用其中的观点、时间线索。
2. 不要编造用户没记录过的内容；没有相关笔记时坦诚说明，再基于对话本身继续。
3. 语气温暖、有启发；可以反问、可以提出值得深入的问题。
4. 保持简洁，不堆砌套话。`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: UIMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 取最新一条用户消息作为检索查询
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');
    const query = getMessageText(lastUserMessage);

    const sources = await retrieveRelevantMemos(query);
    const system = buildSystemPrompt(sources);
    const modelMessages = await convertToModelMessages(messages);

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // 先把来源作为 data part 下发，前端可展示引用
        writer.write({
          type: 'data-sources',
          data: sources.map((s) => ({
            id: s.id,
            preview: s.preview,
            displayDate: s.displayDate,
          })),
        });

        const result = streamText({
          model: provider(CHAT_MODEL),
          system,
          messages: modelMessages,
          temperature: 0.6,
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: any) {
    console.error('[chat] 请求失败:', error);
    return new Response(
      JSON.stringify({ error: error?.message || '对话失败' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
