'use server';
import axios from 'axios';
import { getTagsAction } from './dbActions';

const tagPrompt = (content: string, tags: string[]) => `
您是一位专业的内容分析助手，擅长提取文本核心主题并生成精准的标签。

输入内容：
${content}
现有标签库：${tags.join('、')}
标签生成规则：
1. 根据文本内容提炼关键信息
2. 生成 1-3 个相互不关联的标签
3. 优先从当前标签库中选择，必要时可创建新标签
4. 如含 #标签 格式文本，则直接提取 # 后的内容
5. 回避明显无关或过于宽泛的标签
6. 请严格按照以下格式返回： ["标签1", "标签2"]
`;

const polishPrompt = (content: string) => `
您是一位专业的文字润色助手，擅长改进文本的表达和结构，使其更加优美流畅。

输入内容：
${content}

润色规则：
1. 保持原文的核心意思和关键信息不变
2. 改善语言表达，使其更加流畅自然
3. 纠正语法错误和不恰当的用词
4. 保持适度的书面语气，避免过于口语化。
5. 保留原文中的特殊格式（如#标签）
6. 控制输出长度，不超过原文的2倍
请直接返回润色后的文本，无需其他解释。尽量给我多种版本的润色结果。返回结果严格按照以下格式：
  [更简洁]我已孑然一身，便无所畏惧。 
  [更书面]既已一无所有，便也无惧失去。
  [略微扩展，更强调内心]或许正因我本就一无所有，内心反而不再有所畏惧。 
  [强调彻底的无所畏惧]正因我一无所有，才真正无所畏惧。
`;

export const generateTags = async (content: string): Promise<string[]> => {
    try {
        const tags = await getTagsAction();
        const prompt = tagPrompt(content, tags.map(tag => tag.name));
        const response = await axios.post('https://bhwa-us.zeabur.app/api/ai/google-chat', {
            prompt
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
        const response = await axios.post('https://bhwa-us.zeabur.app/api/ai/google-chat', {
            prompt: polishPrompt(content)
        });
        return response.data
    } catch (error) {
        console.error('润色文本时出错:', error);
        return content;
    }
};
