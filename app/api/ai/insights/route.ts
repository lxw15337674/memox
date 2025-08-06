import { createClient } from "@libsql/client";
import { callAI, AIServiceError } from "../../../../src/services/aiService";


// --- Clients Setup ---
const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

console.log("🔧 AI Insights Route initialized");

// Comprehensive insight prompt (moved from aiActions.ts)
const comprehensiveInsightPrompt = `
# 角色定义
你是一位资深的心理学家、数据分析师和人生导师的结合体，拥有敏锐的洞察力和温暖的表达方式。你的任务是从用户的笔记中发现他们自己可能都没有意识到的深层思考模式和行为规律。

# 分析目标
从以下用户笔记中，发现并生成具有启发性的洞察，帮助用户更好地了解自己的思考模式、行为习惯和内心世界。

# 用户笔记数据
时间范围：{startDate} 至 {endDate}
总笔记数：{totalCount}

笔记内容（按时间倒序）：
{allMemoContents}

# 深度分析任务

## 1. 自动数据分析
请你自己完成以下数据分析：
- 统计每个话题/标签的出现频率
- 识别时间模式（什么时候写什么内容）
- 分析内容长度和深度的变化
- 发现情感色彩的分布和变化
- 识别关键词和短语的重复出现

## 2. 多维度洞察发现
基于你的分析，请从以下维度生成洞察：

### A. 思考模式洞察
- 用户思考问题的习惯方式
- 关注焦点的转移规律
- 思维深度的变化趋势
- 解决问题的思路模式

示例表达：
"你有没有发现，每当遇到困难时，你总是首先从【X角度】思考，这可能反映了你的【某种特质】..."

### B. 情感规律洞察  
- 情绪触发的时间和情境模式
- 情感处理和表达方式
- 积极/消极情绪的平衡点
- 情感恢复的机制

示例表达：
"看起来每当【某种情况】发生时，你的情绪会【某种变化】，也许这背后隐藏着【更深层的原因】..."

### C. 主题关联洞察
- 看似无关话题之间的潜在联系
- 跨领域思考的共同线索
- 价值观在不同场景中的体现
- 兴趣爱好与人生态度的关系

示例表达：
"有个有趣的发现：你在谈论【A话题】和【B话题】时，都会提到【共同元素】，这可能说明【深层联系】..."

### D. 回避与盲点洞察
- 很少被提及但重要的生活领域
- 浅层讨论后就转移的话题
- 可能存在的心理防御机制
- 未被充分探索的内在需求

示例表达：
"也许有件事你一直在有意无意地回避，就是【某个话题】，这可能因为【可能的原因】..."

### E. 成长轨迹洞察
- 思维方式的演进过程
- 价值观的调整和坚持
- 应对挑战能力的提升
- 自我认知的深化过程

示例表达：
"从你最近的记录可以看出，你在【某方面】有了明显的成长，特别是【具体表现】..."

## 3. 输出格式要求

请严格按照以下JSON格式输出，确保JSON格式完整有效：

{
  "overview": "对用户整体思考模式的简洁总结（不超过200字）",
  "insights": [
    {
      "type": "思考模式|情感规律|主题关联|回避盲点|成长轨迹",
      "title": "简短的洞察标题",
      "content": "详细洞察内容",
      "evidence": "具体例证",
      "suggestion": "建议",
      "confidence": "高|中|低"
    }
  ],
  "patterns": {
    "time_patterns": "时间规律",
    "topic_frequency": "主要话题",
    "emotional_trends": "情感趋势",
    "writing_style": "写作风格"
  },
  "questions_to_ponder": [
    "思考问题1",
    "思考问题2"
  ]
}

重要提醒：
1. 请确保JSON格式完整，所有引号都要配对
2. 字符串中不要包含未转义的引号
4. 只返回JSON，不要包含其他文字说明

## 5. 质量标准
每个洞察都应该：
- 让用户产生"咦，确实是这样"的恍然大悟感
- 具有一定的意外性，而非显而易见的观察
- 能够引发进一步的自我思考
- 基于具体的内容证据，而非主观臆测
- 具有建设性和启发性

现在请开始你的分析和洞察生成。记住，你的目标是成为用户最懂他的朋友，帮助他发现自己思考和生活中的美妙模式。
`;

/**
 * Format memos for AI analysis
 */
function formatMemosForAI(memos: any[]) {
    return memos.map((memo, index) =>
        `[${index + 1}] ${memo.created_at}
标签: ${memo.tags?.join(', ') || '无'}
内容: ${memo.content}
---`
    ).join('\n\n');
}

/**
 * Get memos data for insight analysis
 */
async function getMemosForInsight(options: {
    maxMemos?: number;
    timeRange?: { start: string; end: string };
} = {}) {
    const { maxMemos = 20, timeRange } = options;

    console.log("📊 Fetching memos for insight analysis...");

    try {
        let sql = `
            SELECT 
                m.id, 
                m.content, 
                m.created_at, 
                m.updated_at,
                GROUP_CONCAT(t.name) as tags
            FROM memos m
            LEFT JOIN _MemoToTag mt ON m.id = mt.A
            LEFT JOIN tags t ON mt.B = t.id
            WHERE m.deleted_at IS NULL
        `;

        const args: any[] = [];

        if (timeRange) {
            sql += ` AND m.created_at >= ? AND m.created_at <= ?`;
            args.push(timeRange.start, timeRange.end);
        }

        sql += `
            GROUP BY m.id, m.content, m.created_at, m.updated_at
            ORDER BY m.created_at DESC
            LIMIT ?
        `;
        args.push(maxMemos);

        const result = await turso.execute({ sql, args });

        const memos = result.rows.map(row => ({
            id: String(row.id),
            content: String(row.content),
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
            tags: row.tags ? String(row.tags).split(',').filter(Boolean) : []
        }));

        console.log(`✅ Retrieved ${memos.length} memos for analysis`);
        return memos;

    } catch (error) {
        console.error("❌ Error fetching memos:", error);
        throw new Error("Failed to fetch memos for analysis");
    }
}

// Main API handler for the POST request
export async function POST(req: Request) {
    const startTime = Date.now();
    console.log("\n🚀 AI Insights API called at:", new Date().toISOString());

    try {
        const body = await req.json();
        const { maxMemos = 30, timeRange } = body;

        console.log("📋 Request parameters:", { maxMemos, timeRange });

        // 1. Get memos data
        console.log("\n📍 Step 1: Fetching memos data...");
        const memos = await getMemosForInsight({ maxMemos, timeRange });

        if (memos.length === 0) {
            console.log("⚠️ No memos found for analysis");
            return new Response(JSON.stringify({
                error: "没有找到足够的笔记数据用于分析"
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. Prepare data for AI analysis
        console.log("\n📍 Step 2: Preparing data for AI analysis...");
        const startDate = memos[memos.length - 1]?.created_at || '';
        const endDate = memos[0]?.created_at || '';
        const totalCount = memos.length;
        const allMemoContents = formatMemosForAI(memos);

        console.log(`📊 Analysis scope: ${totalCount} memos from ${startDate} to ${endDate}`);

        // 3. Generate insights using AI
        console.log("\n📍 Step 3: Generating insights with AI...");
        const prompt = comprehensiveInsightPrompt
            .replace('{startDate}', startDate)
            .replace('{endDate}', endDate)
            .replace('{totalCount}', totalCount.toString())
            .replace('{allMemoContents}', allMemoContents);

        const aiResponse = await callAI({
            messages: [
                { role: 'system', content: '请分析这些笔记内容' },
                { role: 'user', content: prompt }
            ],
            model: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
            temperature: 0.6,
            maxTokens: 2000
        });

        console.log("✅ AI response received");

        // 4. Process AI response
        console.log("\n📍 Step 4: Processing AI response...");
        let insights;
        const responseData = aiResponse.content;
        if (typeof responseData === 'string') {
            try {
                insights = JSON.parse(responseData);
            } catch (parseError) {
                console.error('❌ JSON parse error:', parseError);
                throw new Error('AI返回的JSON格式无效');
            }
        } else {
            throw new Error(`未知的响应格式，类型: ${typeof responseData}`);
        }

        // 5. Validate and complete necessary fields
        console.log("\n📍 Step 5: Validating and completing response...");

        if (!insights.overview) {
            insights.overview = '基于你的笔记内容，我发现了一些有趣的思考模式和行为规律。';
        }
        if (!insights.insights || !Array.isArray(insights.insights)) {
            insights.insights = [];
        }
        if (!insights.patterns) {
            insights.patterns = {
                time_patterns: '时间模式分析完成',
                topic_frequency: '主题频率分析完成',
                emotional_trends: '情感趋势分析完成',
                writing_style: '写作风格分析完成'
            };
        }
        if (!insights.questions_to_ponder || !Array.isArray(insights.questions_to_ponder)) {
            insights.questions_to_ponder = ['你觉得这些洞察准确吗？', '有哪些地方让你感到意外？'];
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Insights generation completed successfully in ${duration.toFixed(2)}s`);

        return new Response(JSON.stringify({
            ...insights,
            processingTime: duration,
            analyzedMemosCount: totalCount
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;

        if (error instanceof AIServiceError) {
            console.error(`\n❌ AI Service Error after ${duration.toFixed(2)}s:`, error.code, error.message, error.details);
        } else {
            console.error(`\n❌ Insights generation failed after ${duration.toFixed(2)}s:`, error);
        }

        return new Response(JSON.stringify({
            error: error.message || "生成洞察时发生未知错误",
            processingTime: duration
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
} 