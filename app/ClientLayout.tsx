'use client';

import { useState } from 'react';
import Main from './Main';
import SideBar from './SideBar';
import NewMemoEditor from './NewMemoEditor';
import { ShareCardDialog } from '@/components/ShareCard/ShareCardDialog';
import { AIInsightDialog } from '@/components/AIInsightDialog';
import LeftSide from '@/components/LeftSide';
import MemoFilter from '@/components/MemoFilter';
import MobileHeader from '../src/components/MobileHeader';
import Tools from '@/components/Tools';

export default function ClientLayout() {
    const [insightDialogOpen, setInsightDialogOpen] = useState(false);

    const handleInsightClick = () => {
        setInsightDialogOpen(true);
    };

    return (
        <div className="flex flex-col md:flex-row max-w-[100vw] min-h-screen">
            <MobileHeader />
            <LeftSide />
            <div className="flex-1 md:ml-40 md:pl-6 px-4 overflow-hidden">
                <main className="flex flex-col h-full md:mr-60">
                    <div className="w-full md:mt-4 flex flex-col flex-grow overflow-hidden">
                        <div className="mb-2" id='edit'>
                            <NewMemoEditor />
                        </div>
                        <MemoFilter />
                        <section className="overflow-y-auto overflow-x-hidden flex-grow">
                            <Main />
                        </section>
                    </div>
                </main>
            </div>
            <ShareCardDialog />
            <AIInsightDialog
                open={insightDialogOpen}
                onOpenChange={setInsightDialogOpen}
            />

            {/* 更新的侧边栏 */}
            <div className="hidden md:flex h-screen overflow-hidden group flex-col justify-start items-start transition-all px-4 py-4 w-60 fixed right-0 top-0">
                <Tools onInsightClick={handleInsightClick} />
            </div>
        </div>
    );
} 