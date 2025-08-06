// AI服务相关类型定义

// OpenAI 消息格式
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// 更新后的AI请求格式
export interface AIRequest {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export interface AIResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model?: string;
    finishReason?: string;
}

export interface EmbeddingRequest {
    text: string | string[];
    model?: string;
}

export interface EmbeddingResponse {
    embeddings: number[][];
    usage?: {
        totalTokens: number;
    };
}

export interface AIError {
    code: string;
    message: string;
    details?: any;
}

// OpenAI 服务配置
export interface OpenAIConfig {
    baseURL: string;
    apiKey: string;
    defaultModel: string;
    embeddingModel: string;
    timeout: number;
    maxRetries: number;
}

// 旧版AI服务配置（保持兼容）
export interface AIConfig {
    apiUrl: string;
    embeddingApiUrl: string;
    embeddingModel: string;
    timeout: number;
    retryAttempts: number;
}

// 标签生成相关 - Actions层业务类型
export interface TagGenerationOptions {
    maxTags?: number;
    existingTags?: string[];
    model?: string;
}

// AI标签生成响应格式
export interface TagsResponse {
    tags: string[];
}

// 文本润色相关 - Actions层业务类型
export interface PolishOptions {
    style?: 'formal' | 'casual' | 'academic';
    length?: 'shorter' | 'same' | 'longer';
    model?: string;
}

// 润色结果类型
export interface PolishedContent {
    version: string;
    content: string;
}

// AI润色响应格式
export interface PolishResponse {
    versions: PolishedContent[];
}

// 向量搜索相关
export interface VectorSearchOptions {
    topK?: number;
    threshold?: number;
    includeMetadata?: boolean;
}

export interface SearchResult {
    id: string;
    content: string;
    similarity: number;
    metadata?: Record<string, any>;
}

// AI功能类型
export type AIFunction = 'tag-generation' | 'text-polish' | 'insight-analysis' | 'semantic-search' | 'chat';

// 模型配置映射
export interface ModelConfig {
    function: AIFunction;
    model: string;
    temperature?: number;
    maxTokens?: number;
}

// AI服务错误类
export class AIServiceError extends Error {
    constructor(
        public code: string,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'AIServiceError';
    }
} 