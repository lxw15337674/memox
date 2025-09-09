// import { NextRequest, NextResponse } from 'next/server';
// import { client } from '@/db';

// export async function POST(request: NextRequest) {
//     try {
//         // 手动创建统计表
//         await client.execute(`
//             CREATE TABLE IF NOT EXISTS memo_statistics (
//                 id text PRIMARY KEY DEFAULT 'latest' NOT NULL,
//                 total_memos text NOT NULL,
//                 total_days text NOT NULL,
//                 total_words text NOT NULL,
//                 daily_stats text NOT NULL,
//                 calculated_at text NOT NULL,
//                 created_at text NOT NULL
//             )
//         `);

//         console.log('统计表创建成功');

//         return NextResponse.json({
//             success: true,
//             message: '统计表创建成功'
//         });
//     } catch (error) {
//         console.error('创建统计表失败:', error);
//         return NextResponse.json(
//             {
//                 error: 'Failed to create statistics table',
//                 message: error instanceof Error ? error.message : 'Unknown error'
//             },
//             { status: 500 }
//         );
//     }
// }

// export async function GET() {
//     return POST({} as NextRequest);
// }
