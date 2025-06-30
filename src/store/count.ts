import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MemosCount, Note, TagWithCount } from '../api/type';
import { getCountAction, getTagsWithCountAction } from '../api/dbActions';

interface MemoStore {
    tags: TagWithCount[];
    fetchTags: () => void;
    getCount: () => Promise<void>;
    memosCount: MemosCount;
    initializeWithServerData: (tags: TagWithCount[], counts: MemosCount) => void;
}

const useCountStore = create<MemoStore>()(
    persist(
        (set) => ({
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
            fetchTags: () => {
                getTagsWithCountAction().then(tags => {
                    set({ tags });
                });
            },
            getCount: async () => {
                const result = await getCountAction();
                set({ memosCount: result });
            }
        }),
        {
            name: 'memos-count-storage', // storage name/key
        }
    )
);
export default useCountStore;
