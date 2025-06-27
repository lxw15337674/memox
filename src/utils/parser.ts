import { format } from 'date-fns';

export interface Content {
    type: 'text' | 'tag' | 'link';
  text: string;
    url?: string;
}

export const convertGMTDateToLocal = (gmtDate: string | Date): string => {
    try {
        const date = typeof gmtDate === 'string' ? new Date(gmtDate) : gmtDate;
        return format(date, 'yyyy-MM-dd HH:mm');
    } catch (error) {
        console.error('Date conversion error:', error);
        return '';
    }
};

export const parseContent = (content: string): Content[] => {
    const result: Content[] = [];
    const text = content || '';

    // 简单的标签解析：#标签
    const tagRegex = /#([^\s#]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        // 添加标签前的文本
        if (match.index > lastIndex) {
            const beforeText = text.substring(lastIndex, match.index);
            if (beforeText) {
                result.push({
                    type: 'text',
                    text: beforeText
                });
            }
      }

      // 添加标签
      result.push({
          type: 'tag',
          text: match[1]
      });

        lastIndex = match.index + match[0].length;
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        if (remainingText) {
            result.push({
                type: 'text',
                text: remainingText
            });
        }
    }

    // 如果没有匹配到任何标签，返回整个文本
    if (result.length === 0) {
        result.push({
            type: 'text',
            text: text
        });
    }

    return result;
}; 