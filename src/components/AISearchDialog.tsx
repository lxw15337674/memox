'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Loader2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import React, { useState } from 'react';

interface AISearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: SearchSource[];
}

interface SearchSource {
    id: string;
    content: string;
    similarity: number | null;
    preview: string;
    createdAt: string | null;
    updatedAt: string | null;
    displayDate: string;
}

interface SearchResponse {
    answer: string;
    usage: any;
    resultsCount: number;
    processingTime: number;
    sources: SearchSource[];
}

export function AISearchDialog({ open, onOpenChange }: AISearchDialogProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [expandedSources, setExpandedSources] = useState<string[]>([]);

    const scrollAreaRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const scrollArea = scrollAreaRef.current?.querySelector('div');
        if (scrollArea) {
            scrollArea.scrollTop = scrollArea.scrollHeight;
        }
    }, [messages]);

    const toggleSourceExpansion = (messageId: string) => {
        setExpandedSources(prev =>
            prev.includes(messageId)
                ? prev.filter(id => id !== messageId)
                : [...prev, messageId]
        );
    };

    const SourcesSection = ({ sources, messageId }: { sources: SearchSource[], messageId: string }) => {
        const isExpanded = expandedSources.includes(messageId);

        if (!sources || sources.length === 0) return null;

        return (
            <div className="mt-3 border-t pt-3">
                <button
                    onClick={() => toggleSourceExpansion(messageId)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    查看引用源 ({sources.length}条相关笔记)
                </button>

                {isExpanded && (
                    <div className="space-y-2">
                        {sources.map((source, index) => (
                            <div key={source.id} className="border rounded-lg p-3 bg-muted/30">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-muted-foreground mb-1">
                                            📝 笔记 {index + 1}
                                        </div>
                                        <div className="text-sm mb-2" >
                                            {source.preview}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span>📅 {source.displayDate}</span>
                                            {source.similarity !== null && (
                                                <span>📊 相似度: {((1 - source.similarity) * 100).toFixed(1)}%</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/ai/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: userMessage.content }),
            });

            const data: SearchResponse = await response.json();

            if (!response.ok) {
                throw new Error((data as any).error || 'Something went wrong');
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.answer,
                sources: data.sources || []
            };

            setMessages(prev => [...prev, assistantMessage]);

            // 默认展开新消息的引用源
            if (data.sources && data.sources.length > 0) {
                setExpandedSources(prev => [...prev, assistantMessage.id]);
            }
        } catch (error) {
            console.error('Search error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '抱歉，搜索时出现了错误。请稍后再试。'
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl  h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>AI 搜索</DialogTitle>
                    <DialogDescription>
                        向 AI 提问，它会根据你的笔记内容进行回答。
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-grow p-4 border rounded-md" ref={scrollAreaRef}>
                    <div className="space-y-4">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                <Bot className="w-12 h-12 mb-4" />
                                <p>你好！有什么可以帮你的？</p>
                                <p className="text-xs">例如: &ldquo;我上次关于AI的想法是什么？&rdquo;</p>
                            </div>
                        )}
                        {messages.map(m => (
                            <div key={m.id} className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                                {m.role === 'assistant' && <Bot className="w-6 h-6 text-primary flex-shrink-0" />}
                                <div className={`max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                                    <div
                                        className={`px-3 py-2 rounded-lg whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                            }`}
                                    >
                                        {m.content}
                                    </div>
                                    {m.role === 'assistant' && m.sources && (
                                        <SourcesSection sources={m.sources} messageId={m.id} />
                                    )}
                                </div>
                                {m.role === 'user' && <User className="w-6 h-6 text-muted-foreground flex-shrink-0 order-1" />}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-start gap-3">
                                <Bot className="w-6 h-6 text-primary flex-shrink-0" />
                                <div className="px-3 py-2 rounded-lg bg-muted flex items-center">
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    <span className="text-sm">正在搜索...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-4">
                    <Input
                        value={input}
                        onChange={handleInputChange}
                        placeholder="在这里输入你的问题..."
                        className="flex-grow"
                        disabled={isLoading}
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()}>
                        发送
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
} 