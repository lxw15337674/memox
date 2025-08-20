'use server';

import { callAI } from '../services';
import { getTagsAction } from './dbActions';

const tagPrompt = (tags: string[]) => `
您是一位专业的内容分析助手，擅长提取文本核心主题并生成精准的标签。
标签生成规则：
1. 首先检查内容中是否包含#标签格式文本，如有则直接提取,最高优先级，无视其他规则。
   例如：
   "今天天气真好#值得记录的事情#天气"，应提取出"值得记录的事情""天气"标签(不要#).
   "快速消费品领域 #什么玩意 #test"，应提取出"什么玩意""test"标签(不要#).
2. 如果没有包含#标签格式文本，则提炼内容核心主题和关键概念，从现有标签库中选择匹配的标签，不能创造新标签.
3. 确保标签之间相互独立，不重复表达相同概念.
4. 最多生成三个标签
5. 请严格按照JSON格式返回： {"tags": ["标签1", "标签2","标签3"]}，不要添加其他内容或解释。

现有标签库：${tags.join('、')}
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
请按照JSON格式返回润色结果，格式如下：
{
  "polished": {
    "简洁版": "简洁版本的润色文本",
    "书面版": "书面版本的润色文本", 
    "扩展版": "略微扩展的润色文本",
    "强调版": "强调重点的润色文本"
  }
}
`;


export const generateTags = async (content: string): Promise<string[]> => {
    try {
        const tags = await getTagsAction();
        const rolePrompt = tagPrompt(tags.map(tag => tag.name));
        
        const response = await callAI({
            messages: [
                { role: 'system', content: rolePrompt },
                { role: 'user', content: content }
            ],
            temperature: 0.3
        });
        const result = JSON.parse(response.content);
        return result.tags || [];
    } catch (error) {   
        console.error('生成标签时出错:', error);
        return [];
    }
};

export const polishContent = async (content: string): Promise<string> => {
    try {
        const response = await callAI({
            messages: [
                { role: 'system', content: polishPrompt() },
                { role: 'user', content: content }
            ],
            temperature: 0.7
        });
        
        const result = JSON.parse(response.content);
        if (result.polished) {
            // 将多个版本组合成一个字符串返回
            const versions = result.polished;
            return Object.entries(versions)
                .map(([key, value]) => `[${key}] ${value}`)
                .join('\n');
        }
        
        return response.content;
    } catch (error) {
        console.error('润色文本时出错:', error);
        return content;
    }
};
