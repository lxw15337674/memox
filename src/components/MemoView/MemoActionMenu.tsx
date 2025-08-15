import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Icon from '../Icon';
import { useToast } from '@/components/ui/use-toast';
import useMemoStore from '@/store/memo';
import { Button } from '../ui/button';
import { Content } from '@/utils/parser';
import useShareCardStore from '@/store/shareCard';
import { deleteMemo, regenerateMemeTags } from '../../api/dbActions';
import { Note } from '@/api/type';
import { RelatedMemosDialog } from '../RelatedMemosDialog';
import { useState } from 'react';

interface Props {
  memoId: string;
  originalMemo: Note;
  onEdit: () => void;
  parsedContent: Content[][]
}

const MemoActionMenu = ({ memoId, originalMemo, onEdit, parsedContent }: Props) => {
  const { toast } = useToast();
  const { removeMemo,  updateMemo } = useMemoStore();
  const { setOpen, setText } = useShareCardStore();
  const [relatedMemosOpen, setRelatedMemosOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMemo(Number(memoId));
      removeMemo(memoId);
      toast({
        title: "删除成功",
        duration: 1000
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: "请重试",
        duration: 1000
      });
    }
  };

  const handleShare = () => {
    setText(parsedContent);
    setOpen(true);
  };

  const handleRegenTags = async () => {
    try {
      toast({
        title: "标签重新生成中",
        duration: 1000
      });
      const memo = await regenerateMemeTags(Number(memoId));
      if (memo) {
        updateMemo(memoId, { ...memo, embedding: null } as unknown as Note);
      }
      toast({
        title: "标签生成成功",
        description: `生成的标签为: ${(memo as any)?.tags?.map((item: any)=>item.name).join(", ")}`,
        duration: 1000
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "标签生成失败",
        description: "请重试",
        duration: 1000
      });
    }
  };

  const handleViewRelated = () => {
    setRelatedMemosOpen(true);
  };

  const handleRelatedMemoClick = (relatedMemoId: string) => {
    // Scroll to the related memo in the current page
    const memoElement = document.getElementById(`memo-${relatedMemoId}`);
    if (memoElement) {
      memoElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      // Add a temporary highlight effect
      memoElement.classList.add('ring-2', 'ring-primary', 'ring-opacity-50');
      setTimeout(() => {
        memoElement.classList.remove('ring-2', 'ring-primary', 'ring-opacity-50');
      }, 2000);
    } else {
      // If memo is not found on current page, show a message
      toast({
        title: "笔记不在当前页面",
        description: "该相关笔记可能在其他页面，请尝试搜索该笔记",
        duration: 3000
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Icon.MoreVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onEdit}>
            <Icon.Edit2 className="mr-2" size={16} />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShare}>
            <Icon.Share className="mr-2" size={16} />
            分享
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRegenTags}>
            <Icon.Tags className="mr-2" size={16} />
            重新生成标签
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleViewRelated}>
            <Icon.Link className="mr-2" size={16} />
            查看相关笔记
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-red-600">
            <Icon.Trash className="mr-2" size={16} />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RelatedMemosDialog
        open={relatedMemosOpen}
        onOpenChange={setRelatedMemosOpen}
        memoId={memoId}
        originalMemo={originalMemo}
        onMemoClick={handleRelatedMemoClick}
      />
    </>
  );
};

export default MemoActionMenu;
