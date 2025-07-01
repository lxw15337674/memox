import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getMemoByIdAction, getMemosDataActions } from '../api/dbActions';
import useFilterStore, { ImageFilter } from './filter';
import { Note } from '../api/type';
import { Tag } from '@prisma/client';
import { format } from 'date-fns';

interface MemoStore {
  memos: Note[];
  databases: {
    has_more: boolean;
    total: number;
  };
  currentPage: number;
  fetchInitData: () => Promise<void>;
  fetchPagedData: () => Promise<void>;
  removeMemo: (id: string) => number;
  updateMemo: (id: string, memo?: Note) => void;
  updateMemoTags: (id: string, tags: Tag[]) => void;
  addMemoToStore: (memo: Note) => { added: boolean; reason?: string };
  initializeWithServerData: (serverData: { items: Note[]; total: number }) => void;
}

// 检查memo是否满足当前筛选条件
const isMatchingCurrentFilter = (memo: Note, filterState: any): boolean => {
  // 检查标签筛选
  if (filterState.tagFilter && filterState.tagFilter.length > 0) {
    const memoTagNames = memo.tags.map(tag => tag.name);
    const hasAllTags = filterState.tagFilter.every((tag: string) =>
      memoTagNames.includes(tag)
    );
    if (!hasAllTags) return false;
  }

  // 检查文本筛选
  if (filterState.textFilter) {
    if (!memo.content.toLowerCase().includes(filterState.textFilter.toLowerCase())) {
      return false;
    }
  }

  // 检查图片筛选
  if (filterState.imageFilter !== ImageFilter.NO_FilTER) {
    const hasImages = memo.images && memo.images.length > 0;
    if (filterState.imageFilter === ImageFilter.HAS_IMAGE && !hasImages) {
      return false;
    }
    if (filterState.imageFilter === ImageFilter.NO_IMAGE && hasImages) {
      return false;
    }
  }

  // 检查时间筛选
  if (filterState.timeFilter) {
    const memoDate = format(new Date(memo.createdAt), 'yyyy-MM-dd');
    const filterDate = format(filterState.timeFilter, 'yyyy-MM-dd');
    if (memoDate !== filterDate) {
      return false;
    }
  }

  return true;
};

const useMemoStore = create<MemoStore>()(
  devtools(
    immer((set, get) => ({
      memos: [],
      currentPage: 1,
      databases: {
        has_more: false,
        total: 0,
      },
      // SSR 数据初始化方法
      initializeWithServerData: (serverData: { items: Note[]; total: number }) => {
        set((state) => {
          state.databases = {
            has_more: serverData.total > serverData.items.length,
            total: serverData.total
          };
          state.memos = serverData.items;
          state.currentPage = 1;
        });
      },
      // 添加新memo到store中，带智能筛选
      addMemoToStore: (memo: Note) => {
        let result = { added: false, reason: undefined as string | undefined };

        set((state) => {
          // 检查memo是否已存在，避免重复
          const existingIndex = state.memos.findIndex(item => item.id === memo.id);
          if (existingIndex !== -1) {
            result = { added: false, reason: 'already_exists' };
            return;
          }

          // 检查是否满足当前筛选条件
          const filterState = useFilterStore.getState();
          const shouldShow = isMatchingCurrentFilter(memo, filterState);

          if (shouldShow) {
            // 新memo添加到最前面
            state.memos.unshift(memo);
            result = { added: true, reason: undefined };
          } else {
            result = { added: false, reason: 'filter_mismatch' };
          }

          // 无论是否显示，都更新总数
          state.databases.total += 1;
        });

        return result;
      },
      // 删除某条数据
      removeMemo: (pageId: string) => {
        const index = get().memos.findIndex((item) => item.id === pageId);
        set((state) => {
          state.memos.splice(index, 1);
          state.databases.total = Math.max(0, state.databases.total - 1);
        });
        return index;
      },
      // 更新数据
      updateMemo: (id: string, memo?: Note) => {
        if (memo) {
          set((state) => {
            const index = state.memos.findIndex((item) => item.id === id);
            if (index !== -1) {
              state.memos[index] = { ...memo, link: memo.link || undefined };
            }
          });
          return;
        }
        getMemoByIdAction(id).then((data) => {
          set((state) => {
            const index = state.memos.findIndex((item) => item.id === id);
            if (index !== -1 && data) {
              state.memos[index] = { ...data, link: data.link || undefined };
            }
          });
        });
      },
      // 更新memo的标签（用于异步标签生成完成后）
      updateMemoTags: (id: string, tags: Tag[]) => {
        set((state) => {
          const index = state.memos.findIndex((item) => item.id === id);
          if (index !== -1) {
            state.memos[index].tags = tags;
          }
        });
      },
      // 获取初始化数据
      fetchInitData: async () => {
        const response = await getMemosDataActions({
          filter: useFilterStore.getState().filterParams,
          desc: useFilterStore.getState().desc,
          page: 1
        });
        if (response) {
          set((state) => {
            state.databases = {
              has_more: (response.total ?? 0) > (response.items?.length ?? 0),
              total: response.total ?? 0
            };
            state.memos = response.items ?? [];
            state.currentPage = 1;
          });
        }
      },
      // 获取分页数据
      fetchPagedData: async () => {
        const nextPage = get().currentPage + 1;
        const response = await getMemosDataActions({
          filter: useFilterStore.getState().filterParams,
          desc: useFilterStore.getState().desc,
          page: nextPage
        });
        if (response) {
          set((state) => {
            // 追加新数据到现有memos
            const newItems = response.items ?? [];
            state.memos.push(...newItems);

            // 更新分页状态
            state.currentPage = nextPage;

            // 更新has_more状态
            state.databases.has_more = state.memos.length < (response.total ?? 0);

            // 确保total是最新的
            state.databases.total = response.total ?? 0;
          });
        }
      },
    })),
    {
      name: 'memo',
    }
  )
);

export default useMemoStore;