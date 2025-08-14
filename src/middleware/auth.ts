import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '../api/type';

// 统一API Key配置
const API_KEY = process.env.ACCESS_CODE || 'memox-api-2024';

// 创建统一的错误响应
function createAuthErrorResponse(message: string, status: number = 401): NextResponse {
    const response: ApiResponse = {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status });
}

// 验证API Key
function validateApiKey(apiKey: string): boolean {
    return apiKey === API_KEY;
}

// 从请求中提取API Key
function extractApiKey(request: NextRequest): string | null {
    // 优先从Authorization header获取
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // 从X-API-Key header获取
    const apiKeyHeader = request.headers.get('X-API-Key');
    if (apiKeyHeader) {
        return apiKeyHeader;
    }

    // 从查询参数获取（不推荐，但提供兼容性）
    const url = new URL(request.url);
    const apiKeyParam = url.searchParams.get('apiKey');
    if (apiKeyParam) {
        return apiKeyParam;
    }

    return null;
}

// 统一API认证中间件
export function requireApiAuth(request: NextRequest): NextResponse | null {
    // 提取API Key
    const apiKey = extractApiKey(request);

    if (!apiKey) {
        return createAuthErrorResponse(
            'API Key required. Please provide it via Authorization header (Bearer token), X-API-Key header, or apiKey query parameter.',
            401
        );
    }

    // 验证API Key
    const isValid = validateApiKey(apiKey);

    if (!isValid) {
        return createAuthErrorResponse('Invalid API Key', 401);
    }

    // 验证通过，继续处理请求
    return null;
}

// 检查用户是否已认证（用于在处理函数中使用）
export function isAuthenticated(request: NextRequest): boolean {
    const apiKey = extractApiKey(request);
    if (!apiKey) return false;
    return validateApiKey(apiKey);
}
