import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '../../../src/api/type';
import { requireApiAuth } from '../../../src/middleware/auth';

// 创建统一的API响应函数
function createApiResponse<T>(
    success: boolean,
    data?: T,
    message?: string,
    error?: string
): ApiResponse<T> {
    return {
        success,
        data,
        message,
        error,
        timestamp: new Date().toISOString(),
    };
}

// GET /api/health - 健康检查端点，验证API密钥
export async function GET(request: NextRequest) {
    // 应用认证中间件
    const authError = requireApiAuth(request);
    if (authError) {
        return authError;
    }

    try {
        // 如果通过了认证验证，返回健康状态
        const healthData = {
            status: 'healthy',
            service: 'memox-api',
            version: '1.0.0',
            authenticated: true,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };

        return NextResponse.json(
            createApiResponse(true, healthData, 'Service is healthy and API key is valid'),
            { status: 200 }
        );

    } catch (error: any) {
        console.error('GET /api/health error:', error);
        return NextResponse.json(
            createApiResponse(false, null, undefined, error.message || 'Health check failed'),
            { status: 500 }
        );
    }
}
