import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getMemoByIdAction, getMemosDataActions } from '../api/dbActions';
import useFilterStore from './filter';
import { Note } from '../api/type';

interface MemoStore {
  memos: Note[];
  databases: {
    has_more: boolean;
    items: Note[];
    total: number;
  };
  currentPage: number;
  fetchInitData: () => Promise<void>;
  fetchPagedData: () => Promise<void>;
  removeMemo: (id: string) => number;
  updateMemo: (id: string, memo?: Note) => void;
  fetchFirstData: () => Promise<void>;
  initializeWithServerData: (serverData: { items: Note[]; total: number }) => void;
}

const useMemoStore = create<MemoStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        memos: [],
        currentPage: 1,
        databases: {
          has_more: false,
          items: [],
          total: 0,
        },
        // SSR 数据初始化方法
        initializeWithServerData: (serverData: { items: Note[]; total: number }) => {
          set((state) => {
            state.databases = {
              has_more: serverData.total > serverData.items.length,
              items: serverData.items,
              total: serverData.total
            };
            state.memos = serverData.items;
            state.currentPage = 1;
          });
        },
        // 删除某条数据
        removeMemo: (pageId: string) => {
          const index = get().memos.findIndex((item) => item.id === pageId);
          set((state) => { state.memos.splice(index, 1) });
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
        fetchFirstData: async () => {
          const databases = await getMemosDataActions();
          if (databases?.items) {
            set((state) => {
              state.memos.unshift(databases.items[0]);
            })
          }
        },
        // 获取初始化数据
        fetchInitData: async () => {
          const response = await getMemosDataActions({
            filter: useFilterStore.getState().filterParams,
            desc: useFilterStore.getState().desc,
            page: 1
          });
          if (response) {
            const databases = {
              has_more: false,
              items: response.items ?? [],
              total: response.total ?? 0
            };
            set((state) => {
              state.databases = databases;
              state.memos = databases.items;
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
            const databases = {
              has_more: false,
              items: response.items ?? [],
              total: response.total ?? 0
            };
            set((state) => {
              state.databases = databases;
              state.memos.push(...databases.items);
              state.currentPage = nextPage;
            });
          }
        },
      })),
      {
        name: 'memos-storage', // 存储名称
        storage: createJSONStorage(() => localStorage),
      }
    ),
    {
      name: 'memo',
    }
  )
);

export default useMemoStore;