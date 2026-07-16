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
  parentIndex: number; // 根为 -1
  depth: number;
  similarityToParent: number | null; // 根为 null
}

interface WalkMeta {
  totalChars: number;
  length: number;
  weakestIndex: number; // 相似度最低的父子边（子节点下标）
  deepestLeafIndex: number; // 最深的叶
}

type Phase = 'loading' | 'error' | 'canvas';

// ── 布局常量（整齐树：根在左，向右分层，兄弟纵向铺开）──────
const CARD_W = 230;
const CARD_H = 165;
const COL_STRIDE = CARD_W + 90; // 层间步进（横向 = depth，留父子曲线空间）
const ROW_STRIDE = CARD_H + 40; // 兄弟节点纵向间距
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

// 整齐树布局：x = depth（根在左），y = 叶子顺序递归分配、内部节点取子节点均值
function computeLayout(nodes: WalkNode[]) {
  const children: number[][] = nodes.map(() => []);
  nodes.forEach((n, i) => {
    if (n.parentIndex >= 0) children[n.parentIndex].push(i);
  });

  const positions: Array<{ x: number; y: number }> = new Array(nodes.length);
  let leafCursor = 0;

  const assignY = (i: number): number => {
    const ch = children[i];
    let y: number;
    if (ch.length === 0) {
      y = leafCursor * ROW_STRIDE;
      leafCursor++;
    } else {
      const ys = ch.map(assignY);
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    positions[i] = { x: nodes[i].depth * COL_STRIDE + PAD, y: y + PAD };
    return y;
  };
  assignY(0);

  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const width = maxDepth * COL_STRIDE + CARD_W + PAD * 2;
  const height = Math.max(...positions.map((p) => p.y)) + CARD_H + PAD;
  return { positions, width, height };
}

export function RandomWalkDialog() {
  const { open, startMemoId, runId, setOpen } = useWalkStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<WalkNode[]>([]);
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
    setNodes([]);
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
      if (!data.nodes || data.nodes.length === 0) {
        throw new Error('没有可漫游的笔记');
      }
      setNodes(data.nodes);
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
    () => (nodes.length > 0 ? computeLayout(nodes) : null),
    [nodes],
  );

  // 悬停某卡时高亮：该节点 + 到根的祖先链 + 直接子节点
  const connected = useMemo(() => {
    if (hoveredIndex == null || nodes.length === 0) return null;
    const set = new Set<number>([hoveredIndex]);
    let p = nodes[hoveredIndex]?.parentIndex ?? -1;
    while (p >= 0) {
      set.add(p);
      p = nodes[p].parentIndex;
    }
    nodes.forEach((n, i) => {
      if (n.parentIndex === hoveredIndex) set.add(i);
    });
    return set;
  }, [hoveredIndex, nodes]);

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
    if (nodes.length === 0) return null;
    const times = nodes
      .map((n) => new Date(n.createdAt).getTime())
      .filter((t) => !isNaN(t));
    const min = Math.min(...times);
    const max = Math.max(...times);
    const daySpan = Math.max(0, Math.round((max - min) / 86400000));

    const deepIdx = meta?.deepestLeafIndex ?? nodes.length - 1;
    const weakIdx = meta?.weakestIndex ?? -1;
    const weakTo = weakIdx > 0 ? nodes[weakIdx] : null;
    const weakFrom =
      weakTo && weakTo.parentIndex >= 0 ? nodes[weakTo.parentIndex] : null;

    return {
      daySpan,
      fromDate: formatDot(new Date(min).toISOString()),
      toDate: formatDot(new Date(max).toISOString()),
      first: nodes[0],
      last: nodes[deepIdx],
      length: meta?.length ?? nodes.length,
      totalChars: meta?.totalChars ?? 0,
      weakFrom,
      weakTo,
      weakStep: weakTo?.depth ?? 0,
    };
  }, [nodes, meta]);

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
                {/* 连线层：父子曲线 */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={layout.width}
                  height={layout.height}
                >
                  {nodes.map((node, i) => {
                    if (node.parentIndex < 0) return null;
                    const a = layout.positions[node.parentIndex];
                    const b = layout.positions[i];
                    const x1 = a.x + CARD_W; // 父节点右缘
                    const y1 = a.y + CARD_H / 2;
                    const x2 = b.x; // 子节点左缘
                    const y2 = b.y + CARD_H / 2;
                    const mx = (x1 + x2) / 2;
                    // 边高亮：两端都在高亮集合内（= 祖先链 / 直接子节点）
                    const active =
                      hoveredIndex == null ||
                      (!!connected && connected.has(i) && connected.has(node.parentIndex));
                    const sim = node.similarityToParent ?? 0.5;
                    const base = 0.2 + sim * 0.35;
                    const opacity =
                      hoveredIndex == null ? base : active ? 0.9 : 0.05;
                    return (
                      <path
                        key={node.id}
                        d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={opacity}
                        strokeWidth={active && hoveredIndex != null ? 2.5 : 1.6}
                        className={
                          active && hoveredIndex != null
                            ? 'text-violet-500'
                            : 'text-zinc-400'
                        }
                      />
                    );
                  })}
                </svg>

                {/* 卡片 — 复用首页卡片样式 */}
                {nodes.map((node, i) => {
                  const pos = layout.positions[i];
                  const isRoot = node.parentIndex < 0;
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
                          isRoot ? 'border-primary ring-1 ring-primary/40' : '',
                        ].join(' ')}
                      >
                        {/* 顶行：起点标记 / 与父节点关联度 */}
                        <div className="flex items-center justify-between gap-1 mb-1 min-h-[16px]">
                          {isRoot ? (
                            <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                              <Footprints className="w-3 h-3" />
                              起点
                            </span>
                          ) : (
                            <span />
                          )}
                          {node.similarityToParent !== null && (
                            <span className="text-[11px] font-medium px-1.5 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40">
                              {(node.similarityToParent * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>

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
              {expandNode?.similarityToParent != null && (
                <span className="ml-1">
                  关联度 {(expandNode.similarityToParent * 100).toFixed(0)}%
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
                    <div className="text-2xl font-bold">第 {stats.weakStep} 层</div>
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
