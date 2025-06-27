import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Icon from './Icon';
import { useRequest } from 'ahooks';
import { generateInsights } from '../api/aiActions';
import { getMemosForInsight } from '../api/dbActions';
import { AIInsight, InsightResponse } from '../api/type';

interface AIInsightDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const InsightCard: React.FC<{ insight: AIInsight }> = ({ insight }) => {
    const getTypeIcon = (type: string) => {
        switch (type) {
            case '思考模式': return <Icon.Brain size={16} />;
            case '情感规律': return <Icon.Heart size={16} />;
            case '主题关联': return <Icon.Network size={16} />;
            case '回避盲点': return <Icon.Eye size={16} />;
            case '成长轨迹': return <Icon.TrendingUp size={16} />;
            default: return <Icon.Lightbulb size={16} />;
        }
    };

    const getConfidenceColor = (confidence: string) => {
        switch (confidence) {
            case '高': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case '中': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case '低': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
        }
    };

    return (
        <Card className="mb-4">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {getTypeIcon(insight.type)}
                        <CardTitle className="text-base">{insight.title}</CardTitle>
                    </div>
                    <Badge variant="secondary" className={getConfidenceColor(insight.confidence)}>
                        {insight.confidence}信度
                    </Badge>
                </div>
                <Badge variant="outline" className="w-fit">
                    {insight.type}
                </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground leading-relaxed">
                    {insight.content}
                </div>

                {insight.evidence && (
                    <div className="border-l-4 border-blue-200 pl-3 py-2 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                            支撑证据
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                            {insight.evidence}
                        </div>
                    </div>
                )}

                {insight.suggestion && (
                    <div className="border-l-4 border-green-200 pl-3 py-2 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                        <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                            思考建议
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                            {insight.suggestion}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export const AIInsightDialog: React.FC<AIInsightDialogProps> = ({ open, onOpenChange }) => {
    const [insightData, setInsightData] = useState<InsightResponse | null>(null);

    const { loading, run: generateInsightReport } = useRequest(
        async () => {
            const memos = await getMemosForInsight({ maxMemos: 50 });
            const insights = await generateInsights(memos);
            setInsightData(insights);
            return insights;
        },
        {
            manual: true,
            onError: (error) => {
                console.error('生成洞察失败:', error);
            }
        }
    );

    const handleGenerate = () => {
        generateInsightReport();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Icon.Brain size={20} />
                        AI 洞察分析
                    </DialogTitle>
                    <DialogDescription>
                        基于你的笔记内容，发现思考模式和行为规律
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {!insightData && !loading && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Icon.Brain size={48} className="text-muted-foreground" />
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-medium">开始你的洞察之旅</h3>
                                <p className="text-sm text-muted-foreground max-w-md">
                                    AI将分析你的笔记内容，发现隐藏的思考模式、情感规律和成长轨迹
                                </p>
                            </div>
                            <Button onClick={handleGenerate} className="flex items-center gap-2">
                                <Icon.Sparkles size={16} />
                                生成洞察报告
                            </Button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Icon.Loader2 size={32} className="animate-spin text-primary" />
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-medium">AI正在分析你的笔记...</h3>
                                <p className="text-sm text-muted-foreground">
                                    这可能需要几十秒，请耐心等待
                                </p>
                            </div>
                        </div>
                    )}

                    {insightData && (
                        <div className="space-y-6">
                            {/* 总览 */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Icon.Eye size={18} />
                                        洞察总览
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm leading-relaxed">{insightData.overview}</p>
                                </CardContent>
                            </Card>

                            {/* 主要洞察 */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Icon.Lightbulb size={18} />
                                    核心洞察 ({insightData.insights.length})
                                </h3>
                                {insightData.insights.map((insight, index) => (
                                    <InsightCard key={index} insight={insight} />
                                ))}
                            </div>

                            {/* 数据模式 */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Icon.BarChart size={18} />
                                        数据模式
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <h4 className="font-medium text-sm mb-2">⏰ 时间规律</h4>
                                        <p className="text-sm text-muted-foreground">{insightData.patterns.time_patterns}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm mb-2">🏷️ 主题频率</h4>
                                        <p className="text-sm text-muted-foreground">{insightData.patterns.topic_frequency}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm mb-2">💭 情感趋势</h4>
                                        <p className="text-sm text-muted-foreground">{insightData.patterns.emotional_trends}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm mb-2">✍️ 写作风格</h4>
                                        <p className="text-sm text-muted-foreground">{insightData.patterns.writing_style}</p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 思考问题 */}
                            {insightData.questions_to_ponder.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Icon.HelpCircle size={18} />
                                            值得思考的问题
                                        </CardTitle>
                                        <CardDescription>
                                            这些问题可能会帮助你进一步了解自己
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {insightData.questions_to_ponder.map((question, index) => (
                                                <li key={index} className="flex items-start gap-2 text-sm">
                                                    <Icon.ArrowRight size={14} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                                                    <span>{question}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}

                            {/* 重新生成按钮 */}
                            <div className="flex justify-center pt-4">
                                <Button variant="outline" onClick={handleGenerate} disabled={loading}>
                                    <Icon.RefreshCw size={16} className="mr-2" />
                                    重新生成洞察
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}; 