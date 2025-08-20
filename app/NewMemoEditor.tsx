'use client'
import React from 'react';
import Editor from '@/components/Editor';
import { useRequest, useSessionStorageState } from 'ahooks';
import { createNewMemo, regenerateMemeTags } from '../src/api/dbActions';
import useMemoStore from '../src/store/memo';
import useCountStore from '../src/store/count';
import useFilterStore from '../src/store/filter';
import { useToast } from '../src/components/ui/use-toast';
import { startConfettiAnimation } from '../src/lib/utils';

const EDITOR_CACHE_KEY = 'memo-editor-cache';

const NewMemoEditor: React.FC = () => {
    const [editorCache, setEditorCache] = useSessionStorageState<{
        content: string;
        images: string[];
    }>(EDITOR_CACHE_KEY, {
        defaultValue: { content: '', images: [] }
    });
    
    const { addMemoToStore } = useMemoStore();
    const { updateCountsAfterMemoAdded } = useCountStore();
    const { hasFilter } = useFilterStore();
    const { toast } = useToast();
    
    // Simplified update cache function
    const updateCache = (content: string, images: string[] = []) => {
        setEditorCache({ content, images });
    };
    
    // Clear cache after successful submission
    const clearCache = () => {
        setEditorCache({ content: '', images: [] });
    };

    const { runAsync: createRecord } = useRequest(createNewMemo, {
        manual: true,
        onSuccess: async (newMemo) => {
            // 转换link字段的类型：null -> undefined
            const noteForStore = {
                ...newMemo,
                link: newMemo.link || undefined
            };

            // 尝试将新创建的memo添加到store中
            const addResult = addMemoToStore(noteForStore);

            // 更新计数统计
            updateCountsAfterMemoAdded(noteForStore);

            // 根据添加结果显示不同的提示
            if (addResult.added) {
                toast({
                    title: '创建成功',
                    description: '已成功创建新笔记',
                });
                startConfettiAnimation();
            } else if (addResult.reason === 'filter_mismatch') {
                toast({
                    title: '创建成功',
                    description: hasFilter
                        ? '新笔记已创建，但不满足当前筛选条件，请清除筛选查看'
                        : '新笔记已创建',
                    duration: 4000,
                });
                // 不启动彩带动画，因为用户看不到新笔记
            } else if (addResult.reason === 'already_exists') {
                toast({
                    title: '笔记已存在',
                    description: '该笔记已经存在于列表中',
                    variant: 'destructive',
                });
            } else {
                // 默认成功提示
                toast({
                    title: '创建成功',
                    description: '已成功创建新笔记',
                });
                startConfettiAnimation();
            }
            clearCache();
        }
    });

    return (
        <Editor 
            onSubmit={createRecord} 
            defaultValue={editorCache?.content || ''}
            defaultImages={editorCache?.images || []}
            onChange={updateCache}
        />
    );
};

export default NewMemoEditor;
