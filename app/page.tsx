import ClientLayout from './ClientLayout';
import { getMemosDataActions, getTagsWithCountAction, getCountAction } from '@/api/dbActions';
import { Desc } from '@/store/filter';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // 并行获取首页所需的初始数据
  const [initialMemos, tags, counts] = await Promise.all([
    getMemosDataActions({
      page: 1,
      desc: Desc.DESC
    }).catch(error => {
      console.error('Failed to fetch initial memos:', error);
      return { items: [], total: 0 };
    }),
    getTagsWithCountAction().catch(error => {
      console.error('Failed to fetch tags:', error);
      return [];
    }),
    getCountAction().catch(error => {
      console.error('Failed to fetch counts:', error);
      return { 
        dailyStats: [], 
        total: 0, 
        daysCount: 0, 
        totalWords: 0, 
        lastUpdated: new Date().toISOString() 
      };
    })
  ]);

  return (
    <ClientLayout
      initialData={{
        memos: initialMemos,
        tags,
        counts
      }}
    />
  );
}