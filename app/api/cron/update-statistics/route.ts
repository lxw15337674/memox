import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { isNull } from 'drizzle-orm';
import { format } from 'date-fns';
import { calculateWordCount } from '@/utils';

export async function POST(request: NextRequest) {
    try {
        // 验证是否为Vercel Cron请求
        const authHeader = request.headers.get('authorization');
        if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('开始更新统计数据...');

        // 获取所有未删除的memo
        const memos = await db
            .select({
                content: schema.memos.content,
                createdAt: schema.memos.createdAt
            })
            .from(schema.memos)
            .where(isNull(schema.memos.deletedAt));

        console.log(`获取到 ${memos.length} 条memo`);

        // 计算总字数
        let totalWords = 0;
        for (const memo of memos) {
            totalWords += calculateWordCount(memo.content);
        }

        // 按日期分组统计
        const groupByDate = memos.reduce((acc: Record<string, number>, memo) => {
            const date = format(new Date(memo.createdAt), 'yyyy/MM/dd');
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});

        // 计算其他统计
        const total = memos.length;
        const daysCount = Object.keys(groupByDate).length;

        // 构建每日统计数据
        const dailyStats = Object.entries(groupByDate).map(([date, count]) => ({
            date,
            count
        }));

        // 当前时间
        const now = new Date().toISOString();

        // 删除旧的统计数据
        await db.delete(schema.memoStatistics);

        // 插入新的统计数据
        await db.insert(schema.memoStatistics).values({
            id: 'latest',
            totalMemos: total.toString(),
            totalDays: daysCount.toString(),
            totalWords: totalWords.toString(),
            dailyStats: JSON.stringify(dailyStats),
            calculatedAt: now,
            createdAt: now
        });

        console.log('统计数据更新完成:', {
            total,
            daysCount,
            totalWords,
            calculatedAt: now
        });

        return NextResponse.json({
            success: true,
            statistics: {
                total,
                daysCount,
                totalWords,
                calculatedAt: now
            }
        });

    } catch (error) {
        console.error('更新统计数据失败:', error);
        return NextResponse.json(
            { 
                error: 'Failed to update statistics',
                message: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// 允许手动触发（用于测试和初始化）
export async function GET(request: NextRequest) {
    // 只在开发环境或有特殊token时允许GET请求
    const token = request.nextUrl.searchParams.get('token');
    if (process.env.NODE_ENV === 'production' && token !== process.env.MANUAL_TRIGGER_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 复用POST逻辑
    return POST(request);
}
