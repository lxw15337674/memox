'use client';
import classNames from 'classnames';
import NavigationDrawer from './NavigationDrawer';
import useIsMobile from '@/hooks/useIsMobile';
import { ModeToggle } from './LeftSide/ModeToggle';
import { Setting } from './LeftSide/Setting';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Brain, Search, Loader2 } from 'lucide-react';

interface Props {
  className?: string;
  children?: React.ReactNode;
  onInsightClick?: () => void;
  isInsightLoading?: boolean;
  hasInsights?: boolean;
  onSearchClick?: () => void;
}

const MobileHeader = (props: Props) => {
  const {
    className,
    onInsightClick,
    isInsightLoading = false,
    hasInsights = false,
    onSearchClick
  } = props;
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <div
      className={classNames(
        'sticky top-0 px-4 py-2  bg-opacity-80 backdrop-blur-lg flex md:hidden flex-row justify-between items-center w-full h-auto flex-nowrap shrink-0 z-1000 ',
        className,
      )}
    >
      <div className="flex flex-row justify-start items-center mr-2 shrink-0 overflow-hidden">
        <NavigationDrawer />
      </div>
      <div className="flex flex-row justify-end items-center gap-1">
        {/* AI功能下拉菜单 */}
        {(onInsightClick || onSearchClick) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline" size="icon"
                title="AI功能"
              >
                {/* 状态指示器 */}
                {hasInsights && !isInsightLoading && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-background" />
                )}

                {isInsightLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onInsightClick && (
                <DropdownMenuItem
                  onClick={onInsightClick}
                  disabled={isInsightLoading}
                  className="flex items-center gap-2"
                >
                  {isInsightLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Brain className="w-3 h-3" />
                  )}
                  <span className="text-sm">AI洞察</span>
                  {hasInsights && !isInsightLoading && (
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full ml-auto" />
                  )}
                </DropdownMenuItem>
              )}
              {onSearchClick && (
                <DropdownMenuItem
                  onClick={onSearchClick}
                  className="flex items-center gap-2"
                >
                  <Search className="w-3 h-3" />
                  <span className="text-sm">AI搜索</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <ModeToggle />
        <Setting />
      </div>
    </div>
  );
};

export default MobileHeader;
