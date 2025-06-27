'use client'
import React from 'react';
import { ModeToggle } from './ModeToggle';
import { Setting } from './Setting';

interface LeftSideProps {
  onInsightClick: () => void;
  isInsightLoading?: boolean;
  hasInsights?: boolean;
}

const LeftSide: React.FC<LeftSideProps> = ({
  onInsightClick,
  isInsightLoading = false,
  hasInsights = false
}) => {
  return (
    <div
      className="
        hidden 
        md:flex
        flex-col
        justify-between
        fixed md:w-40 group top-0 left-0 select-none border-r dark:border-zinc-800 h-full bg-zinc-50 dark:bg-zinc-800 dark:bg-opacity-40 transition-all hover:shadow-xl z-2 p-4"
    >
      <div className="flex flex-col gap-3">
        <Setting />
        {/* AI洞察按钮 */}
        <button
          onClick={onInsightClick}
          disabled={isInsightLoading}
          className="
            relative
            flex flex-col items-center justify-center
            w-full h-16 p-2
            rounded-lg border border-border
            bg-background hover:bg-accent
            transition-all duration-200
            group/insight
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          title="AI洞察分析"
        >
          {/* 状态指示器 */}
          {hasInsights && !isInsightLoading && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          )}

          {isInsightLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mb-1" />
              <span className="text-xs text-muted-foreground">分析中</span>
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5 mb-1 text-muted-foreground group-hover/insight:text-primary transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <span className="text-xs text-muted-foreground group-hover/insight:text-primary transition-colors">
                AI洞察
              </span>
            </>
          )}
        </button>
      </div>

      <ModeToggle />
    </div>
  );
};

export default LeftSide;
