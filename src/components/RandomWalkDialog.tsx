'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { toBlob } from 'html-to-image';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { MemoContent } from './MemoView/MemoView';
import { convertGMTDateToLocal } from '@/utils/parser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import useWalkStore from '@/store/walk';
import {
  Loader2,
  Footprints,
  Sparkles,
  X,
  RefreshCcw,
  Dices,
  Crosshair,
  Calendar,
  ArrowRight,
  Share2,
} from 'lucide-react';

interface WalkNode {
  id: string;
  content: string;
  createdAt: string;
  tags: string[];
  similarityToPrev: number | null;
  isJump: boolean;
}

interface WalkEdge {
  source: number;
  target: number;
  similarity: number;
}

interface WalkMeta {
  totalChars: number;
  biggestJumpIndex: number;
  length: number;
}

type Phase = 'loading' | 'error' | 'canvas';

// ── 布局常量（横向弧线图：卡片一排从左到右，语义边走弧线）────
const CARD_W = 230;
const CARD_H = 165;
const COL_STRIDE = CARD_W + 60; // 列间步进（横向主轴，留弧线呼吸）
const ARC_MAX = 200; // 语义弧线最大高度（卡片上下各留一条弧区）
const PAD = 70; // 画布内边距

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

function formatDot(dateString: string): string {
  try {
    const d = new Date(dateString);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  } catch {
    return '';
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s}秒`;
}

// 横向弧线图：所有卡片同一水平基线，从左到右排开；语义边走弧线避开卡片
function computeLayout(path: WalkNode[]) {
  const baselineY = PAD + ARC_MAX; // 卡片基线，上方留弧区
  const positions = path.map((_, i) => ({
    x: i * COL_STRIDE + PAD,
    y: baselineY,
  }));
  const width = (path.length - 1) * COL_STRIDE + CARD_W + PAD * 2;
  const height = baselineY + CARD_H + ARC_MAX + PAD;
  return { positions, width, height };
}

export function RandomWalkDialog() {
  const { open, startMemoId, runId, setOpen } = useWalkStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<WalkNode[]>([]);
  const [edges, setEdges] = useState<WalkEdge[]>([]);
  const [meta, setMeta] = useState<WalkMeta | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const [expandNode, setExpandNode] = useState<WalkNode | null>(null);
  const [postcardOpen, setPostcardOpen] = useState(false);

  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const postcardRef = useRef<HTMLDivElement | null>(null);

  const fetchWalk = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setPath([]);
    setEdges([]);
    setMeta(null);
    setHoveredIndex(null);
    setPostcardOpen(false);
    setExpandNode(null);
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
      setEdges(Array.isArray(data.edges) ? data.edges : []);
      setMeta(data.meta);
      startTimeRef.current = Date.now();
      setPhase('canvas');
    } catch (err: any) {
      setError(err.message || '漫游失败');
      setPhase('error');
    }
  }, [startMemoId]);

  useEffect(() => {
    if (open && runId > 0) fetchWalk();
  }, [open, runId, fetchWalk]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const layout = useMemo(
    () => (path.length > 0 ? computeLayout(path) : null),
    [path],
  );

  // 悬停某卡时，与之相连的节点集合（主链邻 + 语义边邻）；null=无悬停
  const connected = useMemo(() => {
    if (hoveredIndex == null) return null;
    const set = new Set<number>([hoveredIndex]);
    if (hoveredIndex > 0) set.add(hoveredIndex - 1);
    if (hoveredIndex < path.length - 1) set.add(hoveredIndex + 1);
    for (const e of edges) {
      if (e.source === hoveredIndex) set.add(e.target);
      if (e.target === hoveredIndex) set.add(e.source);
    }
    return set;
  }, [hoveredIndex, edges, path.length]);

  // 按画布高度自适应缩放，保证整条河流纵向可见，只需横向拖动
  const fitScale = useCallback(() => {
    if (!layout || typeof window === 'undefined') return 0.9;
    const availH = window.innerHeight - 140; // 减去顶栏/底栏
    return Math.min(1, Math.max(0.45, availH / layout.height));
  }, [layout]);

  // 载入后聚焦起点
  useEffect(() => {
    if (phase !== 'canvas') return;
    const t = setTimeout(() => {
      transformRef.current?.zoomToElement('walk-node-0', fitScale(), 400);
    }, 100);
    return () => clearTimeout(t);
  }, [phase, fitScale]);

  const recenter = () =>
    transformRef.current?.zoomToElement('walk-node-0', fitScale(), 400);

  const openPostcard = () => {
    setElapsed(Date.now() - startTimeRef.current);
    setPostcardOpen(true);
  };

  // 明信片统计
  const stats = useMemo(() => {
    if (path.length === 0) return null;
    const times = path
      .map((n) => new Date(n.createdAt).getTime())
      .filter((t) => !isNaN(t));
    const min = Math.min(...times);
    const max = Math.max(...times);
    const daySpan = Math.max(0, Math.round((max - min) / 86400000));
    return {
      daySpan,
      fromDate: formatDot(new Date(min).toISOString()),
      toDate: formatDot(new Date(max).toISOString()),
      first: path[0],
      last: path[path.length - 1],
      length: meta?.length ?? path.length,
      totalChars: meta?.totalChars ?? 0,
      jumpStep: meta?.biggestJumpIndex ?? 0,
    };
  }, [path, meta]);

  const handleShare = async () => {
    if (!postcardRef.current) return;
    try {
      const blob = await toBlob(postcardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      if (!blob) return;
      const file = new File([blob], 'random-walk.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '随机漫步' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'random-walk.png';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // 用户取消或不支持，静默
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-100 dark:bg-zinc-900">
      {/* 顶栏 */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/90 to-transparent">
        <Button variant="ghost" size="icon" onClick={close} title="退出 (Esc)">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Footprints className="w-4 h-4" />
          随机漫步
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={recenter} title="回到起点">
            <Crosshair className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchWalk} title="换一条路">
            <Dices className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 主体 */}
      {phase === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p>正在铺设漫游小径…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={fetchWalk}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            重试
          </Button>
        </div>
      )}

      {phase === 'canvas' && layout && (
        <>
          <TransformWrapper
            ref={transformRef}
            minScale={0.25}
            maxScale={2.5}
            initialScale={0.7}
            limitToBounds={false}
            centerOnInit
            doubleClick={{ disabled: true }}
            smooth={false}
            wheel={{ step: 0.12 }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: layout.width, height: layout.height }}
            >
              <div
                className="relative"
                style={{ width: layout.width, height: layout.height }}
              >
                {/* 连线层：语义弧线 + 主链直线 */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={layout.width}
                  height={layout.height}
                >
                  {/* 语义边：弧线，上下交替 */}
                  {edges.map((e, idx) => {
                    const a = layout.positions[e.source];
                    const b = layout.positions[e.target];
                    const x1 = a.x + CARD_W / 2;
                    const x2 = b.x + CARD_W / 2;
                    const up = idx % 2 === 0;
                    const anchorY = up ? a.y : a.y + CARD_H; // 卡片上/下缘
                    const depth = Math.min(ARC_MAX, (e.target - e.source) * 45 + 40);
                    const cy = up ? anchorY - depth : anchorY + depth;
                    const midX = (x1 + x2) / 2;
                    const active =
                      hoveredIndex == null ||
                      e.source === hoveredIndex ||
                      e.target === hoveredIndex;
                    const base = 0.15 + ((e.similarity - 0.6) / 0.4) * 0.4;
                    const opacity =
                      hoveredIndex == null ? base : active ? 0.9 : 0.04;
                    return (
                      <path
                        key={`e-${e.source}-${e.target}`}
                        d={`M ${x1} ${anchorY} Q ${midX} ${cy} ${x2} ${anchorY}`}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={opacity}
                        strokeWidth={active && hoveredIndex != null ? 2 : 1.2}
                        className="text-violet-400"
                      />
                    );
                  })}

                  {/* 主链：相邻直线 */}
                  {path.map((node, i) => {
                    if (i === 0) return null;
                    const a = layout.positions[i - 1];
                    const b = layout.positions[i];
                    const y = a.y + CARD_H / 2;
                    const active =
                      hoveredIndex == null ||
                      hoveredIndex === i ||
                      hoveredIndex === i - 1;
                    return (
                      <line
                        key={node.id}
                        x1={a.x + CARD_W / 2}
                        y1={y}
                        x2={b.x + CARD_W / 2}
                        y2={y}
                        stroke={node.isJump ? '#f59e0b' : 'currentColor'}
                        strokeOpacity={
                          hoveredIndex != null && !active
                            ? 0.05
                            : node.isJump
                              ? 0.9
                              : 0.3
                        }
                        strokeWidth={node.isJump ? 2.5 : 2}
                        strokeDasharray={node.isJump ? '6 6' : undefined}
                        className="text-zinc-400"
                      />
                    );
                  })}
                </svg>

                {/* 卡片 — 复用首页卡片样式 */}
                {path.map((node, i) => {
                  const pos = layout.positions[i];
                  return (
                    <button
                      key={node.id}
                      id={`walk-node-${i}`}
                      onClick={() => setExpandNode(node)}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      style={{
                        left: pos.x,
                        top: pos.y,
                        width: CARD_W,
                        height: CARD_H,
                        opacity: connected && !connected.has(i) ? 0.35 : 1,
                      }}
                      className="absolute text-left transition-opacity duration-200"
                    >
                      <Card
                        className={[
                          'h-full flex flex-col p-3 shadow-sm transition-shadow hover:shadow-md',
                          node.isJump ? 'border-amber-400 ring-1 ring-amber-300' : '',
                        ].join(' ')}
                      >
                        {/* 顶行：关联度 / 跳跃标记 */}
                        {node.similarityToPrev !== null && (
                          <div className="flex items-center justify-end gap-1 mb-1">
                            {node.isJump && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                                <Sparkles className="w-3 h-3" />
                                跳跃
                              </span>
                            )}
                            <span
                              className={[
                                'text-[11px] font-medium px-1.5 rounded-full',
                                node.isJump
                                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40'
                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40',
                              ].join(' ')}
                            >
                              {(node.similarityToPrev * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}

                        {/* 正文（首页同款解析，隐藏行内 #标签） */}
                        <div className="flex-1 overflow-hidden">
                          <MemoContent content={node.content || '内容为空'} />
                        </div>

                        {/* 底行：标签 + 时间，首页同款 */}
                        <div className="flex justify-between items-end mt-2 pt-1 gap-2">
                          <div className="flex flex-wrap gap-1 overflow-hidden max-h-5">
                            {node.tags.map((t) => (
                              <span
                                key={t}
                                className="bg-blue-50 text-blue-700 text-[11px] px-1.5 py-0.5 rounded-md dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] text-gray-500 flex-shrink-0 whitespace-nowrap">
                            {convertGMTDateToLocal(new Date(node.createdAt))}
                          </div>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </TransformComponent>
          </TransformWrapper>

          {/* 底部结束按钮 */}
          <div className="absolute bottom-0 inset-x-0 z-20 flex justify-center px-4 py-6 bg-gradient-to-t from-background/90 to-transparent">
            <Button size="lg" onClick={openPostcard} className="min-w-[180px]">
              结束漫步 · 看明信片
            </Button>
          </div>
        </>
      )}

      {/* 卡片展开全文 */}
      <Dialog open={!!expandNode} onOpenChange={(o) => !o && setExpandNode(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
              <Calendar className="w-4 h-4" />
              {expandNode && formatDate(expandNode.createdAt)}
              {expandNode?.similarityToPrev != null && (
                <span className="ml-1">
                  关联度 {(expandNode.similarityToPrev * 100).toFixed(0)}%
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto">
            <p className="text-base leading-relaxed whitespace-pre-wrap">
              {expandNode?.content || '内容为空'}
            </p>
            {expandNode && expandNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {expandNode.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 明信片 */}
      <Drawer open={postcardOpen} onOpenChange={setPostcardOpen}>
        <DrawerContent className="max-h-[90vh]">
          <div ref={postcardRef} className="bg-background px-6 pt-6 pb-2">
            <DrawerHeader className="p-0 text-left">
              <DrawerTitle className="text-xs tracking-[0.3em] text-muted-foreground font-normal">
                RANDOM WALK
              </DrawerTitle>
            </DrawerHeader>

            {stats && (
              <>
                <p className="text-lg mt-3">本次漫步横跨了</p>
                <div className="flex items-end gap-1 my-1">
                  <span className="text-7xl font-bold leading-none">
                    {stats.daySpan}
                  </span>
                  <span className="text-2xl mb-1">天</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground border-t pt-3 mt-3">
                  <span>{stats.fromDate}</span>
                  <span>{stats.toDate}</span>
                </div>

                <div className="border-l-2 border-emerald-400 pl-3 mt-5 space-y-1">
                  <div className="text-xs text-muted-foreground">从</div>
                  <p className="text-sm line-clamp-2">{stats.first.content}</p>
                  <div className="text-xs text-muted-foreground pt-1">
                    经过 {stats.length} 条笔记
                  </div>
                  <div className="text-xs text-muted-foreground">走到了</div>
                  <p className="text-sm line-clamp-2">{stats.last.content}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center border-t mt-5 pt-4">
                  <div>
                    <div className="text-2xl font-bold">{stats.length}</div>
                    <div className="text-xs text-muted-foreground">条笔记</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{stats.totalChars}</div>
                    <div className="text-xs text-muted-foreground">回顾的字数</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">第 {stats.jumpStep} 步</div>
                    <div className="text-xs text-muted-foreground">跨度最大的一跳</div>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground text-right mt-3">
                  漫步时长 {formatDuration(elapsed)}
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 p-4">
            <Button variant="outline" className="flex-1" onClick={close}>
              退出漫步
            </Button>
            <Button className="flex-1" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" />
              分享
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
