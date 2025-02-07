'use server';
import axios from 'axios';
import { getTagsAction } from './dbActions';
import { ChatCompletion } from 'openai/resources';

const tagPrompt = (content: string, tags: string[]) => `
您是一位专业的内容分析助手，擅长提取文本核心主题并生成精准的标签。

输入内容：
${content}

现有标签库：${tags.join('、')}

标签生成规则：
1. 生成 1-2 个最能概括内容主题的标签
2. 标签必须使用中文
3. 优先考虑从现有标签库中选择
4. 标签应为名词或简短词组（2-6字为宜）
5. 避免使用完整句子或过长描述
6. 确保标签具有普遍性和可复用性
7. 如果内容中包含 #标签 格式的文本，请将 # 后的文本直接提取为标签（例如：#旅行 将生成"旅行"标签）

请严格按照以下返回： ["标签1", "标签2"]
`;

export const generateTags = async (content: string): Promise<string[]> => {
    try {
        const tags = await getTagsAction();
        const prompt = tagPrompt(content, tags.map(tag => tag.name));
        const completion = await axios.post<ChatCompletion>('https://bhwa-api.zeabur.app/api/ai/chat', {
            prompt
        });
        const newTags = JSON.parse(completion.data.choices[0].message.content ?? '');
        return newTags;
    } catch (error) {
        console.error('生成标签时出错:', error);
        return [];
    }
};
