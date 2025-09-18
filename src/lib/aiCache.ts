import { createHash } from 'crypto';

// AI API 缓存配置
const AI_CACHE_CONFIG = {
  insights: { ttl: 24 * 60 * 60, version: 'v1' },
  search: { ttl: 24 * 60 * 60, version: 'v1' },
  related: { ttl: 24 * 60 * 60, version: 'v1' }
} as const;

type AIApiName = keyof typeof AI_CACHE_CONFIG;

interface CacheEntry {
  data: any;
  expiresAt: number;
  createdAt: number;
}

// 内存缓存存储
const cache = new Map<string, CacheEntry>();

// 生成标准化的缓存键
function generateCacheKey(apiName: AIApiName, params: any): string {
  // 标准化参数：移除 undefined 值并排序键
  const normalizedParams = normalizeParams(params);
  const paramsJson = JSON.stringify(normalizedParams);
  const hash = createHash('md5').update(paramsJson).digest('hex');
  const config = AI_CACHE_CONFIG[apiName];
  
  return `ai:${apiName}:${hash}:${config.version}`;
}

// 标准化参数对象
function normalizeParams(params: any): any {
  if (params === null || params === undefined) {
    return {};
  }
  
  if (typeof params !== 'object') {
    return params;
  }
  
  if (Array.isArray(params)) {
    return params.map(normalizeParams);
  }
  
  // 移除 undefined 值并排序键
  const normalized: any = {};
  const sortedKeys = Object.keys(params)
    .filter(key => params[key] !== undefined)
    .sort();
    
  for (const key of sortedKeys) {
    normalized[key] = normalizeParams(params[key]);
  }
  
  return normalized;
}

// 从缓存中获取数据
function getCacheEntry(key: string): any | null {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  // 检查是否过期
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

// 将数据存储到缓存
function setCacheEntry(key: string, data: any, ttlSeconds: number): void {
  const now = Date.now();
  const entry: CacheEntry = {
    data,
    expiresAt: now + (ttlSeconds * 1000),
    createdAt: now
  };
  
  cache.set(key, entry);
}

// 获取缓存统计信息
function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      expiredEntries++;
    } else {
      validEntries++;
    }
  }
  
  return {
    totalEntries: cache.size,
    validEntries,
    expiredEntries
  };
}

// 清理过期的缓存条目
function cleanupExpiredEntries(): number {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}

// AI API 缓存中间件
export function withAICache<T extends (...args: any[]) => Promise<Response>>(
  apiName: AIApiName,
  handler: T
): T {
  const config = AI_CACHE_CONFIG[apiName];
  
  return (async (req: Request, ...args: any[]) => {
    const startTime = Date.now();
    
    try {
      // 解析请求体参数
      const body = await req.json();
      
      // 生成缓存键
      const cacheKey = generateCacheKey(apiName, body);
      
      // 尝试从缓存读取
      const cachedResult = getCacheEntry(cacheKey);
      if (cachedResult) {
        const duration = Date.now() - startTime;
        console.log(`🎯 Cache HIT for ${apiName} (${duration}ms) - Key: ${cacheKey}`);
        
        // 添加缓存信息到响应
        const responseData = {
          ...cachedResult,
          cache: {
            status: 'hit',
            key: cacheKey,
            ageSec: Math.floor((Date.now() - cache.get(cacheKey)!.createdAt) / 1000),
            expiresAt: new Date(cache.get(cacheKey)!.expiresAt).toISOString()
          }
        };
        
        return new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`⚡ Cache MISS for ${apiName} - Key: ${cacheKey}`);
      
      // 重新构造请求对象（因为已经读取了 body）
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body)
      });
      
      // 执行原始处理函数
      const response = await handler(newReq, ...args);
      
      // 如果响应成功，缓存结果
      if (response.ok) {
        const responseText = await response.text();
        let responseData;
        
        try {
          responseData = JSON.parse(responseText);
          
          // 存储到缓存
          setCacheEntry(cacheKey, responseData, config.ttl);
          
          const duration = Date.now() - startTime;
          console.log(`💾 Cached result for ${apiName} (${duration}ms) - Key: ${cacheKey}`);
          
          // 添加缓存信息到响应
          responseData.cache = {
            status: 'miss',
            key: cacheKey,
            ageSec: 0,
            expiresAt: new Date(Date.now() + config.ttl * 1000).toISOString()
          };
          
          return new Response(JSON.stringify(responseData), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse response for caching: ${parseError}`);
          // 返回原始响应
          return new Response(responseText, {
            status: response.status,
            headers: response.headers
          });
        }
      }
      
      // 响应不成功，直接返回
      return response;
      
    } catch (error) {
      console.error(`❌ Error in AI cache middleware for ${apiName}:`, error);
      
      // 出错时尝试执行原始处理函数
      try {
        return await handler(req, ...args);
      } catch (handlerError) {
        console.error(`❌ Handler also failed for ${apiName}:`, handlerError);
        return new Response(JSON.stringify({ 
          error: 'Internal server error' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }) as T;
}

// 导出工具函数
export {
  getCacheStats,
  cleanupExpiredEntries,
  generateCacheKey,
  normalizeParams
};
