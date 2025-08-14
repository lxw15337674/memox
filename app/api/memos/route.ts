import { NextRequest, NextResponse } from 'next/server';
import {
    createNewMemo
} from '../../../src/api/dbActions';
import {
    ApiResponse,
    CreateMemoRequest
} from '../../../src/api/type';
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

// 参数验证函数
function validateCreateMemoRequest(body: any): CreateMemoRequest | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        return null;
    }

    return {
        content: body.content.trim(),
        images: Array.isArray(body.images) ? body.images : [],
        link: body.link || undefined,
        tags: Array.isArray(body.tags) ? body.tags : [],
    };
}




// POST /api/memos - 创建新memo
export async function POST(request: NextRequest) {
    // 应用认证中间件
    const authError = requireApiAuth(request);
    if (authError) {
        return authError;
    }

    try {
        const body = await request.json();

        // 验证请求体
        const validatedData = validateCreateMemoRequest(body);
        if (!validatedData) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '请求参数无效，content字段必填'),
                { status: 400 }
            );
        }

        // 转换为Server Action需要的格式
        const newMemoData = {
            content: validatedData.content,
            images: validatedData.images,
            link: validatedData.link,
            tags: validatedData.tags,
        };

        // 调用现有的创建函数
        const createdMemo = await createNewMemo(newMemoData);

        return NextResponse.json(
            createApiResponse(true, createdMemo, '创建memo成功'),
            { status: 201 }
        );

    } catch (error: any) {
        console.error('POST /api/memos error:', error);
        return NextResponse.json(
            createApiResponse(false, null, undefined, error.message || '创建memo失败'),
            { status: 500 }
        );
    }
}
