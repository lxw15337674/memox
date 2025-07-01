'use server';

import axios from 'axios';
import { getTagsAction } from './dbActions';
import { API_URL } from './config';

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
7. 最多生成两个标签
8. 请严格按照格式返回： ["标签1", "标签2"]
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
