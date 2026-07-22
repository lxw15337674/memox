'use client';
import { useEffect, useRef, useState } from 'react';
import MemoView from './MemoView';
import SimpleMemoView from './SimpleMemoView';
import type { Note } from '../../api/type';

// Muuri 自带的 d.ts 是内部签名，与真实公开 API 不符，这里用宽松类型避免与其冲突
type MuuriGrid = any;

interface WaterfallListProps {
    memos: Note[];
    isSimpleMode: boolean;
}

// 每个卡片外壳：等宽响应式列（移动 1 列 / md 2 列 / lg 3 列），高度按内容自适应。
// m-1 = 4px 边距，宽度减 8px 使「N×宽 + 2N×4px = 100%」严丝合缝、无横向缝隙。
const ITEM_CLASS =
    'muuri-item absolute w-[calc(100%-8px)] md:w-[calc(50%-8px)] lg:w-[calc(33.333%-8px)] m-1 z-0';

/**
 * 瀑布流列表：等宽列 + 变高，Muuri 用最短列算法竖向打包，列高自平衡、无横向留白。
 * React 负责渲染卡片 DOM，Muuri 只负责测量高度并定位。
 * 二者通过「按 DOM 元素身份增量同步 + 排序」保持一致，兼容无限滚动追加与增删改。
 */
export default function WaterfallList({ memos, isSimpleMode }: WaterfallListProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<MuuriGrid | null>(null);
    const [ready, setReady] = useState(false);

    // 初始化 / 销毁 Muuri 实例。
    // muuri 在模块顶层访问 window/document，静态 import 会在 SSR 崩溃，
    // 故在客户端 effect 内动态 import。
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let grid: MuuriGrid = null;
        let destroyed = false;

        import('muuri').then(({ default: Muuri }) => {
            if (destroyed || !containerRef.current) return;
            // 构造时以 '.muuri-item' 选择器登记当前 DOM 中的全部卡片
            grid = new (Muuri as any)(el, {
                items: '.muuri-item',
                dragEnabled: false,
                layoutDuration: 200,
                layout: {
                    fillGaps: true, // 用后续小卡片回填空隙，尽量紧密
                    horizontal: false,
                    alignRight: false,
                    alignBottom: false,
                    rounding: true,
                },
            });
            gridRef.current = grid;
            grid.layout(true);
            setReady(true);
        });

        return () => {
            destroyed = true;
            grid?.destroy();
            gridRef.current = null;
        };
    }, []);

    // memos 变化时增量同步 Muuri 的 item 集合，并按 memos 顺序排序后重排
    useEffect(() => {
        const grid = gridRef.current;
        const el = containerRef.current;
        if (!grid || !el) return;

        // React 当前渲染出的所有 item 元素（按 DOM 顺序）
        const domItems = Array.from(el.children).filter((c) =>
            (c as HTMLElement).classList.contains('muuri-item')
        ) as HTMLElement[];
        const domSet = new Set(domItems);

        // Muuri 已登记的 item 元素
        const known: HTMLElement[] = grid.getItems().map((it: any) => it.getElement());
        const knownSet = new Set(known);

        // 新增：DOM 里有、Muuri 不知道的
        const toAdd = domItems.filter((node) => !knownSet.has(node));
        // 移除：Muuri 知道、但 React 已从 DOM 卸载的（元素已被 React 删除，不让 Muuri 再删元素）
        const toRemove = grid
            .getItems()
            .filter((it: any) => !domSet.has(it.getElement()));

        if (toRemove.length) grid.remove(toRemove, { removeElements: false, layout: false });
        if (toAdd.length) grid.add(toAdd, { layout: false });

        // 按 memos 顺序排序（无限滚动追加在尾部、新建 memo 在头部都能对齐）
        const order = new Map(memos.map((m, i) => [String(m.id), i]));
        grid.sort(
            (a: any, b: any) => {
                const ai = order.get(a.getElement().dataset.id ?? '') ?? 0;
                const bi = order.get(b.getElement().dataset.id ?? '') ?? 0;
                return ai - bi;
            },
            { layout: false }
        );

        grid.refreshItems().layout();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memos]);

    // 卡片内图片异步加载会改变高度：load 事件不冒泡，用捕获阶段监听并防抖重排
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let raf = 0;
        const relayout = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                gridRef.current?.refreshItems().layout();
            });
        };
        el.addEventListener('load', relayout, true);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('load', relayout, true);
        };
    }, []);

    // 逐卡片监听尺寸变化：覆盖断点变化（宽度）与就地编辑/内容变化（高度），触发重排。
    // memos 变化后重新订阅当前卡片集合。
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                gridRef.current?.refreshItems().layout();
            });
        });
        el.querySelectorAll('.muuri-item-content').forEach((node) => ro.observe(node));
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [memos]);

    return (
        <div
            ref={containerRef}
            className={`relative transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}
        >
            {memos.map((memo) =>
                memo ? (
                    <div key={memo.id} data-id={String(memo.id)} className={ITEM_CLASS}>
                        <div className="muuri-item-content">
                            {isSimpleMode ? (
                                <SimpleMemoView {...memo} />
                            ) : (
                                <MemoView {...memo} />
                            )}
                        </div>
                    </div>
                ) : null
            )}
        </div>
    );
}
