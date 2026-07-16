'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import Tag from './Tag';
import useWalkStore from '@/store/walk';
import {
  Loader2,
  Footprints,
  Sparkles,
  X,
  RefreshCcw,
  Calendar,
  ArrowRight,
} from 'lucide-react';

interface WalkNode {
  id: string;
  content: string;
  createdAt: string;
  tags: string[];
  similarityToPrev: number | null;
  isJump: boolean;
}

interface WalkMeta {
  totalChars: number;
  biggestJumpIndex: number;
  length: number;
}

type Phase = 'loading' | 'error' | 'walking' | 'finished';

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '未知日期';
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

export function RandomWalkDialog() {
  const { open, startMemoId, runId, setOpen } = useWalkStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<WalkNode[]>([]);
  const [meta, setMeta] = useState<WalkMeta | null>(null);
  const [index, setIndex] = useState(0);

  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const fetchWalk = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setPath([]);
    setMeta(null);
    setIndex(0);
    try {
      const res = await fetch('/api/ai/walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startMemoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '漫游失败');
      if (!data.path || data.path.length === 0) {
        throw new Error('没有可漫游的笔记');
      }
      setPath(data.path);
      setMeta(data.meta);
      startTimeRef.current = Date.now();
      setPhase('walking');
    } catch (err: any) {
      setError(err.message || '漫游失败');
      setPhase('error');
    }
  }, [startMemoId]);

  // 打开 / 每次发起新漫游时拉取路径
  useEffect(() => {
    if (open && runId > 0) {
      fetchWalk();
    }
  }, [open, runId, fetchWalk]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= path.length - 1) {
        setElapsed(Date.now() - startTimeRef.current);
        setPhase('finished');
        return i;
      }
      return i + 1;
    });
  }, [path.length]);

  // 键盘：Esc 关闭，Enter / → 前进
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      } else if (phase === 'walking' && (e.key === 'Enter' || e.key === 'ArrowRight')) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, advance, close]);

  const current = path[index];
  const isLast = index >= path.length - 1;

  const jumpPair = useMemo(() => {
    if (!meta || meta.biggestJumpIndex < 1 || !path[meta.biggestJumpIndex]) return null;
    return {
      from: path[meta.biggestJumpIndex - 1],
      to: path[meta.biggestJumpIndex],
      similarity: path[meta.biggestJumpIndex].similarityToPrev ?? 0,
    };
  }, [meta, path]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Footprints className="w-4 h-4" />
          漫游
          {phase === 'walking' && (
            <span className="text-xs">
              {index + 1} / {path.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={close} title="退出 (Esc)">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* 进度点 */}
      {phase === 'walking' && (
        <div className="flex items-center justify-center gap-1.5 px-4 pb-2">
          {path.map((n, i) => (
            <span
              key={n.id}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-6' : 'w-1.5',
                i > index
                  ? 'bg-muted'
                  : n.isJump
                    ? 'bg-amber-400'
                    : 'bg-primary',
              ].join(' ')}
            />
          ))}
        </div>
      )}

      {/* 主体 */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto px-4 py-6">
        {phase === 'loading' && (
          <div className="flex flex-col items-center text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>正在铺设漫游小径…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={fetchWalk}>
              <RefreshCcw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        )}

        {phase === 'walking' && current && (
          <div
            key={index}
            className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            {current.isJump && (
              <div className="flex items-center justify-center gap-2 mb-4 text-amber-500 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                一次跳跃 · 遇见看似无关的自己
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(current.createdAt)}
              {current.similarityToPrev !== null && !current.isJump && (
                <span className="ml-2">
                  关联度 {(current.similarityToPrev * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-lg md:text-xl leading-relaxed whitespace-pre-wrap text-center">
              {current.content || '内容为空'}
            </p>
            {current.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-6">
                {current.tags.map((t) => (
                  <Tag key={t} text={t} className="text-xs">
                    {t}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'finished' && meta && (
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
            <div className="rounded-2xl border bg-card p-6 shadow-lg">
              <div className="flex items-center gap-2 text-lg font-semibold mb-1">
                <Footprints className="w-5 h-5 text-primary" />
                漫游明信片
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                这一程，你重新遇见了过去的自己。
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6 text-center">
                <div>
                  <div className="text-2xl font-bold">{meta.length}</div>
                  <div className="text-xs text-muted-foreground">经过笔记</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{meta.totalChars}</div>
                  <div className="text-xs text-muted-foreground">跨越字数</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{formatDuration(elapsed)}</div>
                  <div className="text-xs text-muted-foreground">漫步时长</div>
                </div>
              </div>

              {jumpPair && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 mb-6">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    最大的一次跳跃 · 关联度仅 {(jumpPair.similarity * 100).toFixed(0)}%
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex-1 line-clamp-2">
                      {jumpPair.from.content}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                    <span className="flex-1 line-clamp-2">
                      {jumpPair.to.content}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={fetchWalk}>
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  再走一程
                </Button>
                <Button className="flex-1" onClick={close}>
                  完成
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部推进 */}
      {phase === 'walking' && (
        <div className="flex justify-center px-4 py-6">
          <Button size="lg" onClick={advance} className="min-w-[180px]">
            {isLast ? '结束漫步' : '继续漫步'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
