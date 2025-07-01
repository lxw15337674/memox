import { create } from 'zustand';
import { MemosCount, Note, TagWithCount } from '../api/type';
import { getCountAction, getTagsWithCountAction } from '../api/dbActions';
import { format } from 'date-fns';

interface MemoStore {
    tags: TagWithCount[];
    fetchTags: () => void;
    getCount: () => Promise<void>;
    memosCount: MemosCount;
    initializeWithServerData: (tags: TagWithCount[], counts: MemosCount) => void;
    updateCountsAfterMemoAdded: (newMemo: Note) => void;
}

const useCountStore = create<MemoStore>()(
    (set, get) => ({
        tags: [],
        memosCount: {
            dailyStats: [],
            total: 0,
            daysCount: 0
        },
        initializeWithServerData: (tags: TagWithCount[], counts: MemosCount) => {
            set({
                tags,
                memosCount: counts
            });
        },
        updateCountsAfterMemoAdded: (newMemo: Note) => {
            set(state => {
                // 更新总数
                const newTotal = state.memosCount.total + 1;

                // 更新日统计
                const memoDate = format(new Date(newMemo.createdAt), 'yyyy/MM/dd');
                const existingDayIndex = state.memosCount.dailyStats.findIndex(stat => stat.date === memoDate);

                const newDailyStats = [...state.memosCount.dailyStats];
                if (existingDayIndex >= 0) {
                    newDailyStats[existingDayIndex].count += 1;
                } else {
                    newDailyStats.push({ date: memoDate, count: 1 });
                    newDailyStats.sort((a, b) => a.date.localeCompare(b.date));
                }

                // 更新标签计数
                const newTags = [...state.tags];
                newMemo.tags.forEach(memoTag => {
                    const existingTagIndex = newTags.findIndex(tag => tag.name === memoTag.name);
                    if (existingTagIndex >= 0) {
                        newTags[existingTagIndex].memoCount += 1;
                    } else {
                        newTags.push({
                            ...memoTag,
                            memoCount: 1
                        });
                    }
                });

                // 按计数排序
                newTags.sort((a, b) => b.memoCount - a.memoCount);

                return {
                    tags: newTags,
                    memosCount: {
                        ...state.memosCount,
                        total: newTotal,
                        dailyStats: newDailyStats,
                        daysCount: newDailyStats.length
                    }
                };
            });
        },
        fetchTags: () => {
            getTagsWithCountAction().then(tags => {
                set({ tags });
            });
        },
        getCount: async () => {
            const result = await getCountAction();
            set({ memosCount: result });
        }
    })
);
export default useCountStore;
