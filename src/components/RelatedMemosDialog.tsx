'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Card } from './ui/card';
import Icon from './Icon';
import Tag from './Tag';
import { Loader2 } from 'lucide-react';
import { Note } from '../api/type';

interface RelatedMemo {
    id: string;
    content: string;
    aiRelevanceScore: number;
    createdAt: string | null;
    tags: string[];
}

interface RelatedMemosResponse {
    relatedMemos: RelatedMemo[];
    totalCount: number;
    processingTime: number;
}

interface RelatedMemosDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    memoId: string;
    originalMemo?: Note;
    onMemoClick?: (memoId: string) => void;
}

export function RelatedMemosDialog({
    open,
    onOpenChange,
    memoId,
    originalMemo,
    onMemoClick
}: RelatedMemosDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [relatedMemos, setRelatedMemos] = useState<RelatedMemo[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [processingTime, setProcessingTime] = useState<number | null>(null);

    // Helper function to format date
    const formatDisplayDate = (dateString: string | null): string => {
        if (!dateString) return '未知日期';
        try {
            return new Date(dateString).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return '未知日期';
        }
    };

    const fetchRelatedMemos = async () => {
        if (!memoId) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/ai/related', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ memoId }),
            });

            const data: RelatedMemosResponse = await response.json();

            if (!response.ok) {
                throw new Error((data as any).error || 'Failed to fetch related memos');
            }

            setRelatedMemos(data.relatedMemos);
            setProcessingTime(data.processingTime);
        } catch (err: any) {
            console.error('Error fetching related memos:', err);
            let errorMessage = err.message || 'Failed to fetch related memos';

            // Provide specific error messages for common issues
            if (errorMessage.includes('vectors must have the same length')) {
                errorMessage = '此笔记或数据库中的某些笔记缺少向量嵌入，请先运行向量同步脚本';
            } else if (errorMessage.includes('Memo content is empty')) {
                errorMessage = '此笔记内容为空，无法生成向量嵌入';
            } else if (errorMessage.includes('Memo not found')) {
                errorMessage = '找不到指定的笔记';
            }

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch related memos when dialog opens
    useEffect(() => {
        if (open && memoId) {
            fetchRelatedMemos();
        }
    }, [open, memoId]);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setRelatedMemos([]);
            setError(null);
            setProcessingTime(null);
        }
    }, [open]);

    const handleMemoClick = (clickedMemoId: string) => {
        if (onMemoClick) {
            onMemoClick(clickedMemoId);
            onOpenChange(false); // Close dialog after clicking
        }
    };

    const handleRetry = () => {
        fetchRelatedMemos();
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Icon.Link className="w-5 h-5" />
                        相关笔记
                    </DialogTitle>
                    <DialogDescription>
                        基于AI智能分析发现的相关笔记（相关性 &gt; 40%）
                        {processingTime && (
                            <span className="text-xs text-muted-foreground ml-2">
                                处理时间: {processingTime.toFixed(2)}s
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-grow">
                    <div className="space-y-4 p-1">
                        {/* Original Memo Section */}
                        {originalMemo && !isLoading && (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                    <Icon.FileText className="w-4 h-4" />
                                    原笔记
                                </div>
                                <Card className="p-4 bg-primary/5 border-primary/20 h-fit">
                                    <div className="space-y-3">
                                        {/* Header with date */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="bg-primary text-primary-foreground px-2 py-1 rounded-full font-medium">
                                                    原笔记
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                📅 {formatDisplayDate(originalMemo.createdAt)}
                                            </div>
                                        </div>

                                        {/* Complete Content */}
                                        <div className="space-y-2">
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                                {originalMemo.content || '内容为空'}
                                            </p>

                                            {/* Tags */}
                                            {originalMemo.tags && originalMemo.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {originalMemo.tags.map((tag) => (
                                                        <Tag
                                                            key={tag.id}
                                                            text={tag.name}
                                                            className="text-xs"
                                                        >
                                                            {tag.name}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Loading State */}
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-muted-foreground" />
                                <p className="text-muted-foreground">正在分析相关笔记...</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    使用AI智能分析技术匹配相关内容
                                </p>
                            </div>
                        )}

                        {/* Error State */}
                        {error && !isLoading && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Icon.AlertCircle className="w-8 h-8 mb-4 text-destructive" />
                                <p className="text-destructive mb-4">搜索相关笔记时出现错误</p>
                                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                                <Button onClick={handleRetry} variant="outline" size="sm">
                                    <Icon.RefreshCcw className="w-4 h-4 mr-2" />
                                    重试
                                </Button>
                            </div>
                        )}

                        {/* Empty State */}
                        {!isLoading && !error && relatedMemos.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Icon.Search className="w-8 h-8 mb-4 text-muted-foreground" />
                                <p className="text-muted-foreground mb-2">没有找到相关笔记</p>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    可能是因为：AI评估的相关性不够高（&lt;40%）、其他笔记缺少向量嵌入、或者这是一个独特的笔记主题。
                                </p>
                            </div>
                        )}

                        {/* Results */}
                        {!isLoading && !error && relatedMemos.length > 0 && (
                            <>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                                    <Icon.Target className="w-4 h-4" />
                                    找到 {relatedMemos.length} 条相关笔记
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {relatedMemos.map((memo, index) => (
                                        <Card
                                            key={memo.id}
                                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group h-fit"
                                            onClick={() => handleMemoClick(memo.id)}
                                        >
                                            <div className="space-y-3">
                                                {/* Header with similarity_score and date */}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span className="bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                                                            #{index + 1}
                                                        </span>
                                                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                                                            🎯 相关性: {(memo.aiRelevanceScore * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        📅 {formatDisplayDate(memo.createdAt)}
                                                    </div>
                                                </div>

                                                {/* Complete Content */}
                                                <div className="space-y-2">

                                                    <p className="text-sm leading-relaxed group-hover:text-foreground transition-colors whitespace-pre-wrap">
                                                        {memo.content || '内容为空'}
                                                    </p>

                                                    {/* Tags */}
                                                    {memo.tags && memo.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {memo.tags.map((tagName) => (
                                                                <Tag
                                                                    key={tagName}
                                                                    text={tagName}
                                                                    className="text-xs"
                                                                >
                                                                    {tagName}
                                                                </Tag>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
} 