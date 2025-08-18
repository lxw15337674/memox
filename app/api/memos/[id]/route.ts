import { NextRequest, NextResponse } from 'next/server';
import {
    getMemoByIdAction,
    deleteMemo,
    updateMemoAction
} from '../../../../src/api/dbActions';
import {
    ApiResponse,
    UpdateMemoRequest,
    Note
} from '../../../../src/api/type';
import { requireApiAuth } from '../../../../src/middleware/auth';

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

// 验证memo ID
function validateMemoId(id: string): boolean {
    return typeof id === 'string' && id.trim().length > 0;
}

// 验证更新请求数据
function validateUpdateMemoRequest(body: any): UpdateMemoRequest | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    // 至少需要提供一个字段进行更新
    const hasValidField =
        (body.content && typeof body.content === 'string') ||
        Array.isArray(body.images) ||
        body.link !== undefined ||
        Array.isArray(body.tags);

    if (!hasValidField) {
        return null;
    }

    const updateData: UpdateMemoRequest = {};

    if (body.content && typeof body.content === 'string') {
        updateData.content = body.content.trim();
    }

    if (Array.isArray(body.images)) {
        updateData.images = body.images;
    }

    if (body.link !== undefined) {
        updateData.link = body.link;
    }

    if (Array.isArray(body.tags)) {
        updateData.tags = body.tags;
    }

    return updateData;
}


// GET /api/memos/[id] - 获取单个memo
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // 应用认证中间件
    const authError = requireApiAuth(request);
    if (authError) {
        return authError;
    }

    try {
        const { id } = await params;

        // 验证ID
        if (!validateMemoId(id)) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '无效的memo ID'),
                { status: 400 }
            );
        }

        // 获取memo
        const memo = await getMemoByIdAction(id);

        if (!memo) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, 'Memo不存在'),
                { status: 404 }
            );
        }

        return NextResponse.json(
            createApiResponse(true, memo, '获取memo成功'),
            { status: 200 }
        );

    } catch (error: any) {
        console.error(`GET /api/memos/${(await params).id} error:`, error);
        return NextResponse.json(
            createApiResponse(false, null, undefined, error.message || '获取memo失败'),
            { status: 500 }
        );
    }
}


// PUT /api/memos/[id] - 更新memo
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // 应用认证中间件
    const authError = requireApiAuth(request);
    if (authError) {
        return authError;
    }

    try {
        const { id } = await params;

        // 验证ID
        if (!validateMemoId(id)) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '无效的memo ID'),
                { status: 400 }
            );
        }

        // 检查memo是否存在
        const existingMemo = await getMemoByIdAction(id);
        if (!existingMemo) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, 'Memo不存在'),
                { status: 404 }
            );
        }

        const body = await request.json();

        // 验证请求体
        const validatedData = validateUpdateMemoRequest(body);
        if (!validatedData) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '请求参数无效，至少需要提供一个有效字段进行更新'),
                { status: 400 }
            );
        }

        // 转换为Server Action需要的格式
        const updateData = {
            content: validatedData.content || existingMemo.content,
            images: validatedData.images !== undefined ? validatedData.images : (Array.isArray(existingMemo.images) ? existingMemo.images : []),
            link: validatedData.link !== undefined ? validatedData.link : (existingMemo.link ? {
                url: existingMemo.link.link,
                text: existingMemo.link.text
            } : undefined),
            tags: validatedData.tags || existingMemo.tags.map(tag => tag.name),
        };

        // 调用现有的更新函数
        const updatedMemoId = await updateMemoAction(id, updateData);

        if (!updatedMemoId) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '更新memo失败'),
                { status: 500 }
            );
        }

        // 获取更新后的memo
        const updatedMemo = await getMemoByIdAction(id);

        return NextResponse.json(
            createApiResponse(true, updatedMemo, '更新memo成功'),
            { status: 200 }
        );

    } catch (error: any) {
        console.error(`PUT /api/memos/${(await params).id} error:`, error);
        return NextResponse.json(
            createApiResponse(false, null, undefined, error.message || '更新memo失败'),
            { status: 500 }
        );
    }
}

// DELETE /api/memos/[id] - 删除memo
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // 应用认证中间件
    const authError = requireApiAuth(request);
    if (authError) {
        return authError;
    }

    try {
        const { id } = await params;

        // 验证ID
        if (!validateMemoId(id)) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, '无效的memo ID'),
                { status: 400 }
            );
        }

        // 检查memo是否存在
        const existingMemo = await getMemoByIdAction(id);
        if (!existingMemo) {
            return NextResponse.json(
                createApiResponse(false, null, undefined, 'Memo不存在'),
                { status: 404 }
            );
        }

        // 调用现有的删除函数（软删除）
        await deleteMemo(id);

        return NextResponse.json(
            createApiResponse(true, { id }, '删除memo成功'),
            { status: 200 }
        );

    } catch (error: any) {
        console.error(`DELETE /api/memos/${(await params).id} error:`, error);
        return NextResponse.json(
            createApiResponse(false, null, undefined, error.message || '删除memo失败'),
            { status: 500 }
        );
    }
}
