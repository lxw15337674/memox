'use server';

import axios from 'axios';
import { getTagsAction } from './dbActions';
import { API_URL } from './config';
import { Note, InsightResponse } from './type';

const AI_API_URL = `${API_URL}/api/ai/chat`

const tagPrompt = (tags: string[]) => `
您是一位专业的内容分析助手，擅长提取文本核心主题并生成精准的标签。

现有标签库：${tags.join('、')}
标签生成规则：
1. 首先检查内容中是否包含 #标签 格式文本，如有则直接提取(最高优先级，无视其他规则)
   例如：文本中包含"今天天气真好 #值得记录的事情"，应提取出"值得记录的事情"标签(不要#)，
2. 提炼内容核心主题和关键概念
3. 优先从现有标签库中选择匹配的标签
4. 仅当现有标签不足以表达内容核心主题时，创建简洁明确的新标签
5. 避免生成过于宽泛、模糊或无关的标签
6. 确保标签之间相互独立，不重复表达相同概念
7. 最多生成三个标签
7. 请严格按照格式返回： ["标签1", "标签2"]
`;

const polishPrompt = () => `
您是一位专业的文字润色助手，擅长改进文本的表达和结构，使其更加优美流畅。

润色规则：
1. 保持原文的核心意思和关键信息不变
2. 改善语言表达，使其更加流畅自然
3. 纠正语法错误和不恰当的用词
4. 保持适度的书面语气，避免过于口语化。
5. 保留原文中的特殊格式（如#标签）
6. 控制输出长度，不超过原文的2倍
请直接返回润色后的文本，无需其他解释。尽可能给我多种版本的润色结果。返回结果按照以下格式：
  [更简洁]我已孑然一身，便无所畏惧。 
  [更书面]既已一无所有，便也无惧失去。
  [略微扩展，更强调内心]或许正因我本就一无所有，内心反而不再有所畏惧。 
  [强调彻底的无所畏惧]正因我一无所有，才真正无所畏惧。
`;

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
  "overview": "对用户整体思考模式的简洁总结（不超过500字）",
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
3. 控制输出长度，避免截断
4. 只返回JSON，不要包含其他文字说明

## 4. 语气和表达原则
- 使用温和、非批判性的语言
- 以朋友的身份进行温暖的提醒和启发
- 避免过于肯定的断言
- 关注积极面和成长可能性
- 用好奇和探索的态度，而非专家的权威性

## 5. 质量标准
每个洞察都应该：
- 让用户产生"咦，确实是这样"的恍然大悟感
- 具有一定的意外性，而非显而易见的观察
- 能够引发进一步的自我思考
- 基于具体的内容证据，而非主观臆测
- 具有建设性和启发性

现在请开始你的分析和洞察生成。记住，你的目标是成为用户最懂他的朋友，帮助他发现自己思考和生活中的美妙模式。
`;

const formatMemosForAI = (memos: Note[]) => {
    return memos.map((memo, index) =>
        `[${index + 1}] ${memo.createdAt}
标签: ${memo.tags?.map(t => t.name).join(', ') || '无'}
内容: ${memo.content}
---`
    ).join('\n\n');
};

export const generateTags = async (content: string): Promise<string[]> => {
    try {
        const tags = await getTagsAction();
        const rolePrompt = tagPrompt(tags.map(tag => tag.name));
        const response = await axios.post(AI_API_URL, {
            prompt: content,
            rolePrompt
        });
        const newTags = response.data as string[];
        return newTags;
    } catch (error) {   
        console.error('生成标签时出错:', error);
        return [];
    }
};

export const polishContent = async (content: string): Promise<string> => {
    try {
        const response = await axios.post(AI_API_URL, {
            prompt: content,
            rolePrompt: polishPrompt()
        });
        return response.data;
    } catch (error) {
        console.error('润色文本时出错:', error);
        return content;
    }
};

export const generateInsights = async (memos: Note[]): Promise<InsightResponse> => {
    try {
        if (memos.length === 0) {
            throw new Error('没有足够的笔记数据用于分析');
        }

        const startDate = memos[memos.length - 1]?.createdAt?.toString() || '';
        const endDate = memos[0]?.createdAt?.toString() || '';
        const totalCount = memos.length;
        const allMemoContents = formatMemosForAI(memos);

        const prompt = comprehensiveInsightPrompt
            .replace('{startDate}', startDate)
            .replace('{endDate}', endDate)
            .replace('{totalCount}', totalCount.toString())
            .replace('{allMemoContents}', allMemoContents);

        const response = await axios.post(AI_API_URL, {
            prompt: '请分析这些笔记内容',
            rolePrompt: prompt
        });

        // 处理AI响应
        let insights: InsightResponse;

        const responseData = response.data;

        // 如果response.data已经是对象，直接使用
        if (typeof responseData === 'object' && responseData !== null) {
            insights = responseData as InsightResponse;
        } else if (typeof responseData === 'string') {
            // 如果是字符串，尝试JSON解析
            try {
                let cleanData = responseData;
                // 移除可能的markdown代码块标记
                cleanData = cleanData.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                // 尝试修复截断的JSON
                if (!cleanData.trim().endsWith('}')) {
                    const lastBrace = cleanData.lastIndexOf('}');
                    if (lastBrace > 0) {
                        cleanData = cleanData.substring(0, lastBrace + 1);
                    }
                }
                insights = JSON.parse(cleanData);
            } catch (parseError) {
                console.error('JSON解析失败:', parseError);
                throw new Error('AI返回的JSON格式无效');
            }
        } else {
            throw new Error(`未知的响应格式，类型: ${typeof responseData}`);
        }

        // 验证和补全必要字段
        if (!insights.overview) {
            insights.overview = '分析完成';
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
            insights.questions_to_ponder = [];
        }

        return insights;
    } catch (error) {
        console.error('生成洞察时出错:', error);
        throw error;
    }
};
