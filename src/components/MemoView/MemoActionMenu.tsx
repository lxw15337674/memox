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

interface Props {
  memoId: string;
  onEdit: () => void;
  parsedContent: Content[][]
}

const MemoActionMenu = ({ memoId, onEdit, parsedContent }: Props) => {
  const { toast } = useToast();
  const { removeMemo, updateMemo } = useMemoStore();
  const { setOpen, setText } = useShareCardStore();

  const handleDelete = async () => {
    try {
      await deleteMemo(memoId);
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
      await regenerateMemeTags(memoId);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "标签生成失败",
        description: "请重试",
        duration: 1000
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="px-2">
          <Icon.MoreVertical size={20} />
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
          AI 重新生成标签
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-red-600">
          <Icon.Trash className="mr-2" size={16} />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MemoActionMenu;
