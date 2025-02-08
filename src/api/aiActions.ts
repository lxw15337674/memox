'use server';
import axios from 'axios';
import { getTagsAction } from './dbActions';

const tagPrompt = (content: string, tags: string[]) => `
您是一位专业的内容分析助手，擅长提取文本核心主题并生成精准的标签。

输入内容：
${content}

现有标签库：${tags.join('、')}

标签生成规则：
1. 生成 1-2 个最能概括内容主题的标签（根据内容复杂度调整数量）
2. 标签必须使用中文
3. 优先从现有标签库中选择，若无可匹配标签，则生成新标签
4. 标签应为名词或简短词组（2-6字为宜），避免使用形容词、动词或过长描述
5. 确保标签具有普遍性、可复用性和明确性
6. 如果内容中包含 #标签 格式的文本，请将 # 后的文本直接提取为标签（例如：#旅行 将生成"旅行"标签）
7. 避免生成与内容无关的标签或过于宽泛的标签（如"其他"、"杂项"）
8. 如果内容涉及多个主题，请优先选择最核心的主题生成标签

请严格按照以下格式返回： ["标签1", "标签2"]
`;

const polishPrompt = (content: string) => `
您是一位专业的文字润色助手，擅长改进文本的表达和结构，使其更加优美流畅。

输入内容：
${content}

润色规则：
1. 保持原文的核心意思和关键信息不变
2. 改善语言表达，使其更加流畅自然
3. 纠正语法错误和不恰当的用词
4. 保持适度的书面语气，不过分文艺
5. 保留原文中的特殊格式（如 #标签）
6. 控制输出长度，不超过原文的1.5倍
7. 如果原文已经足够好，可以保持不变

请直接返回润色后的文本，无需其他解释。`;

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
