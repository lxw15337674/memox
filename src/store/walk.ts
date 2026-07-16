import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface WalkStore {
  open: boolean;
  // 起点笔记 id；undefined 表示随机起点
  startMemoId?: string;
  // 每次开启自增，用于强制重新拉取路径（同一起点也能再走一程）
  runId: number;
  startWalk: (startMemoId?: string) => void;
  setOpen: (open: boolean) => void;
}

const useWalkStore = create<WalkStore>()(
  devtools(
    (set) => ({
      open: false,
      startMemoId: undefined,
      runId: 0,
      startWalk: (startMemoId) =>
        set((s) => ({ open: true, startMemoId, runId: s.runId + 1 })),
      setOpen: (open) => set({ open }),
    }),
    { name: 'walkStore' },
  ),
);

export default useWalkStore;
