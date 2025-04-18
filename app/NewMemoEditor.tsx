'use client'
import React from 'react';
import Editor from '@/components/Editor';
import { useRequest, useSessionStorageState } from 'ahooks';
import { createNewMemo, regenerateMemeTags } from '../src/api/dbActions';
import useMemoStore from '../src/store/memo';
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
    
    const { fetchFirstData } = useMemoStore();
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
        onSuccess: async ({ id }) => {
            toast({
                title: '创建成功',
                description: '已成功创建新笔记',
            });
            startConfettiAnimation();
            fetchFirstData();
            regenerateMemeTags(id);
            clearCache();
        }
    });

    const handleSubmit = async (memo: any) => {
        return await createRecord(memo);
    };

    return (
        <Editor 
            onSubmit={handleSubmit} 
            defaultValue={editorCache?.content || ''}
            defaultImages={editorCache?.images || []}
            onChange={updateCache}
        />
    );
};

export default NewMemoEditor;
