import OpenAI from 'openai';
import { AIRequest, AIResponse, AIServiceError } from './types';

// OpenAI配置
const openai = new OpenAI({
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKey: process.env.SILICONFLOW_API_KEY,
});

// 模型配置 - 不同功能使用不同模型优化性能和成本
const MODELS = {
    // 轻量级任务使用较小模型
    tags: 'deepseek-ai/DeepSeek-V3',
    // 内容润色使用更强模型
    polish: 'deepseek-ai/DeepSeek-V3',
    // 默认模型
    default: 'deepseek-ai/DeepSeek-V3'
} as const;

/**
 * AI服务错误处理
 */
export { AIServiceError };

/**
 * 调用AI API的核心函数 - 纯AI调用服务，不包含业务逻辑
 */
export async function callAI(request: AIRequest): Promise<AIResponse> {
    try {
        const response = await openai.chat.completions.create({
            model: request.model || MODELS.default,
            messages: request.messages,
            temperature: request.temperature || 0.7,
            max_tokens: request.maxTokens || 1000,
            response_format: { type: "json_object" },
        });

        if (!response.choices || response.choices.length === 0) {
            throw new AIServiceError(
                'NO_RESPONSE',
                'AI API returned no choices',
                { response }
            );
        }

        const content = response.choices[0].message?.content;
        if (!content) {
            throw new AIServiceError(
                'EMPTY_RESPONSE',
                'AI API returned empty content',
                { response }
            );
        }

        return {
            content: content.trim(),
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens
            } : undefined
        };

    } catch (error: any) {
        // 处理OpenAI SDK错误
        if (error.status) {
            throw new AIServiceError(
                'API_ERROR',
                `OpenAI API error: ${error.message}`,
                {
                    status: error.status,
                    type: error.type,
                    code: error.code
                }
            );
        }

        // 重新抛出已经是AIServiceError的错误
        if (error instanceof AIServiceError) {
            throw error;
        }

        // 处理其他网络或系统错误
        throw new AIServiceError(
            'UNKNOWN_ERROR',
            `Unexpected error: ${error.message}`,
            { originalError: error }
        );
    }
}

// 导出模型配置供Actions层使用
export { MODELS };

