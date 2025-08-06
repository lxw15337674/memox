// AI服务 - 纯AI调用接口
export {
    callAI,
    AIServiceError
} from './aiService';

// 向量嵌入服务 - 处理文本向量化
export {
    generateEmbedding,
    embeddingToBuffer,
    bufferToEmbedding,
    EmbeddingServiceError
} from './embeddingService';

// 类型定义
export type {
    AIRequest,
    AIResponse,
    ChatMessage,
    TagGenerationOptions,
    PolishOptions,
    PolishedContent,
    TagsResponse,
    PolishResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    VectorSearchOptions,
    SearchResult,
    AIError,
    OpenAIConfig
} from './types';

// 统一AI服务接口 - 主要给外部使用
export * from './types'; 