import OpenAI from 'openai';

// OpenAI配置 - 使用SiliconFlow API
const openai = new OpenAI({
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKey: process.env.SILICONFLOW_API_KEY,
});

// 嵌入服务配置
const EMBEDDING_CONFIG = {
    model: 'Qwen/Qwen3-Embedding-4B',
    expectedDimensions: 2560
} as const;

// 嵌入服务错误类
export class EmbeddingServiceError extends Error {
    constructor(
        public code: string,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'EmbeddingServiceError';
    }
}

/**
 * 生成文本嵌入向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
        throw new EmbeddingServiceError('INVALID_INPUT', '文本内容不能为空');
    }

    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_CONFIG.model,
            input: text.trim(),
        });

        const embedding = response.data[0]?.embedding;

        if (!embedding || !Array.isArray(embedding)) {
            throw new EmbeddingServiceError(
                'INVALID_RESPONSE',
                'AI返回的嵌入向量格式无效',
                { response }
            );
        }

        // 验证向量维度
        if (embedding.length !== EMBEDDING_CONFIG.expectedDimensions) {
            console.warn(
                `嵌入向量维度不匹配: 期望${EMBEDDING_CONFIG.expectedDimensions}, 实际${embedding.length}`
            );
        }

        return embedding;

    } catch (error: any) {
        if (error instanceof EmbeddingServiceError) {
            throw error;
        }

        // 处理OpenAI SDK错误
        if (error.status) {
            throw new EmbeddingServiceError(
                'API_ERROR',
                `嵌入服务API错误: ${error.message}`,
                {
                    status: error.status,
                    type: error.type,
                    code: error.code
                }
            );
        }

        // 处理其他错误
        throw new EmbeddingServiceError(
            'UNKNOWN_ERROR',
            `生成嵌入向量时发生未知错误: ${error.message}`,
            { originalError: error }
        );
    }
}

/**
 * 将嵌入向量转换为Buffer格式（用于数据库存储）
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
    if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingServiceError('INVALID_INPUT', '嵌入向量格式无效');
    }
    return Buffer.from(new Float32Array(embedding).buffer);
}

/**
 * 将Buffer转换为嵌入向量格式
 */
export function bufferToEmbedding(buffer: Buffer): number[] {
    if (!buffer || !(buffer instanceof Buffer)) {
        throw new EmbeddingServiceError('INVALID_INPUT', 'Buffer格式无效');
    }

    try {
        const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
        return Array.from(float32Array);
    } catch (error) {
        throw new EmbeddingServiceError(
            'CONVERSION_ERROR',
            'Buffer转换为嵌入向量失败',
            { originalError: error }
        );
    }
}

/**
 * 验证嵌入向量格式
 */
export function validateEmbedding(embedding: any): embedding is number[] {
    return (
        Array.isArray(embedding) &&
        embedding.length > 0 &&
        embedding.every((value: any) => typeof value === 'number' && !isNaN(value))
    );
}

/**
 * 计算余弦相似度
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new EmbeddingServiceError(
            'DIMENSION_MISMATCH',
            '向量维度不匹配',
            { vecALength: vecA.length, vecBLength: vecB.length }
        );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

    if (magnitude === 0) {
        return 0;
    }

    return dotProduct / magnitude;
}

// 导出配置常量
export const EMBEDDING_DIMENSIONS = EMBEDDING_CONFIG.expectedDimensions;
export const EMBEDDING_MODEL = EMBEDDING_CONFIG.model; 