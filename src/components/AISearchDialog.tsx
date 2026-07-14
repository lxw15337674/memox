'use client';

import React, { useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Streamdown } from 'streamdown';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
    Reasoning,
    ReasoningTrigger,
    ReasoningContent,
} from '@/components/ai-elements/reasoning';
import {
    Sources,
    SourcesTrigger,
    SourcesContent,
} from '@/components/ai-elements/sources';
import {
    PromptInput,
    PromptInputBody,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputSubmit,
    type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Bot } from 'lucide-react';

interface AISearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ChatSource {
    id: string;
    preview: string;
    displayDate: string;
}

const STORAGE_KEY = 'memox-chat-messages';

function loadMessages(): UIMessage[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function AISearchDialog({ open, onOpenChange }: AISearchDialogProps) {
    const [initialMessages] = useState<UIMessage[]>(loadMessages);

    const { messages, sendMessage, status, setMessages } = useChat({
        transport: new DefaultChatTransport({ api: '/api/ai/chat' }),
        messages: initialMessages,
    });

    // 持久化到 localStorage
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        } catch {
            // 忽略存储错误（隐私模式/超限）
        }
    }, [messages]);

    const isBusy = status === 'submitted' || status === 'streaming';

    const handleSubmit = (message: PromptInputMessage) => {
        const text = message.text?.trim();
        if (!text || isBusy) return;
        sendMessage({ text });
    };

    const handleClear = () => {
        setMessages([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle>AI 对话</DialogTitle>
                            <DialogDescription>
                                和你的笔记对话，它会带着你记过的内容一起回答。
                            </DialogDescription>
                        </div>
                        {messages.length > 0 && (
                            <button
                                onClick={handleClear}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors mr-6"
                            >
                                清空对话
                            </button>
                        )}
                    </div>
                </DialogHeader>

                <Conversation className="flex-1 min-h-0">
                    <ConversationContent>
                        {messages.length === 0 && (
                            <ConversationEmptyState
                                icon={<Bot className="size-10" />}
                                title="你好！有什么可以帮你的？"
                                description="例如：我上次关于 AI 的想法是什么？"
                            />
                        )}

                        {messages.map((m, mIndex) => {
                            const sources = (m.parts || [])
                                .filter((p: any) => p.type === 'data-sources')
                                .flatMap((p: any) => (p.data as ChatSource[]) || []);

                            const textParts = (m.parts || []).filter(
                                (p: any) => p.type === 'text',
                            );

                            const reasoningText = (m.parts || [])
                                .filter((p: any) => p.type === 'reasoning')
                                .map((p: any) => p.text)
                                .join('');

                            // 最后一条助手消息、正在流式且尚无正文时，视为推理进行中
                            const isLastMessage = mIndex === messages.length - 1;
                            const reasoningStreaming =
                                isLastMessage &&
                                status === 'streaming' &&
                                textParts.length === 0;

                            return (
                                <Message from={m.role} key={m.id}>
                                    {m.role === 'assistant' && reasoningText && (
                                        <Reasoning
                                            className="w-full"
                                            isStreaming={reasoningStreaming}
                                        >
                                            <ReasoningTrigger />
                                            <ReasoningContent>{reasoningText}</ReasoningContent>
                                        </Reasoning>
                                    )}
                                    <MessageContent>
                                        {textParts.map((p: any, i: number) => (
                                            <Streamdown key={i}>{p.text}</Streamdown>
                                        ))}
                                    </MessageContent>

                                    {m.role === 'assistant' && sources.length > 0 && (
                                        <Sources>
                                            <SourcesTrigger count={sources.length} />
                                            <SourcesContent>
                                                {sources.map((s, i) => (
                                                    <div
                                                        key={s.id}
                                                        className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground"
                                                    >
                                                        <div className="mb-1 text-foreground/80">
                                                            📝 笔记 {i + 1} · {s.displayDate}
                                                        </div>
                                                        <div className="line-clamp-3">{s.preview}</div>
                                                    </div>
                                                ))}
                                            </SourcesContent>
                                        </Sources>
                                    )}
                                </Message>
                            );
                        })}
                    </ConversationContent>
                    <ConversationScrollButton />
                </Conversation>

                <div className="border-t p-4">
                    <PromptInput onSubmit={handleSubmit}>
                        <PromptInputBody>
                            <PromptInputTextarea placeholder="在这里输入你的问题..." />
                        </PromptInputBody>
                        <PromptInputFooter className="justify-end">
                            <PromptInputSubmit status={status} />
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </DialogContent>
        </Dialog>
    );
}
