// 通用工具函数

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
};

export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

export const throttle = <T extends (...args: any[]) => any>(
    func: T,
    limit: number
): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}; 

/**
 * 计算文本的字数（中英文混合）
 * @param content 要计算的文本内容
 * @returns 字数统计
 */
export const calculateWordCount = (content: string): number => {
    if (!content || typeof content !== 'string') {
        return 0;
    }

    // 移除标签（#标签格式）
    const contentWithoutTags = content.replace(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g, '');
    
    // 移除图片链接和其他markdown格式
    const cleanContent = contentWithoutTags
        .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
        .replace(/\[.*?\]\(.*?\)/g, '') // 移除链接
        .replace(/```[\s\S]*?```/g, '') // 移除代码块
        .replace(/`[^`]*`/g, '') // 移除行内代码
        .trim();

    if (!cleanContent) {
        return 0;
    }

    // 分别计算中文字符和英文单词
    const chineseChars = cleanContent.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = cleanContent
        .replace(/[\u4e00-\u9fa5]/g, '') // 移除中文字符
        .match(/[a-zA-Z]+/g) || []; // 匹配英文单词
    
    // 数字单独计算
    const numbers = cleanContent.match(/\d+/g) || [];
    
    return chineseChars.length + englishWords.length + numbers.length;
};