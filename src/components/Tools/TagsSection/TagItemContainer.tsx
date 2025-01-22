import { TagType } from '@/type';
import Tag from '@/components/Tag';
import useFilterStore from '@/store/filter';
import { cn } from '@/lib/utils';
import { TagWithCount } from '../../../api/type';
import { deleteTagAction, updateTagAction } from '@/api/dbActions';
import useCountStore from '@/store/count';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  tag: TagWithCount;
}

export const TagItemContainer = ({ tag }: Props) => {
  const { tagFilter, setFilter, removeTagFilter } = useFilterStore();
  const { fetchTags } = useCountStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(tag.name);
  const { toast } = useToast();

  const isSelected = () => {
    return tagFilter.includes(tag.name);
  };

  const handleTagClick = () => {
    if (isSelected()) {
      removeTagFilter(tag.name);
    } else {
      setFilter([...tagFilter, tag.name]);
    }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteTagAction(tag.name);
      removeTagFilter(tag.name);
      fetchTags();
      toast({
        description: "标签删除成功"
      });
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toast({
        variant: "destructive",
        description: "标签删除失败"
      });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editedName === tag.name || !editedName.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      await updateTagAction(tag.name, editedName.trim());
      removeTagFilter(tag.name);
      fetchTags();
      setIsEditing(false);
      toast({
        description: "标签更新成功"
      });
    } catch (error) {
      console.error('Failed to edit tag:', error);
      setEditedName(tag.name);
      toast({
        variant: "destructive",
        description: "标签更新失败"
      });
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={handleEdit} onClick={(e) => e.stopPropagation()} className="px-3 py-1.5">
        <div className="flex flex-col gap-1.5">
          <Input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            placeholder="输入标签名称"
          />
          <div className="flex justify-end gap-1">
            <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs">
              保存
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setIsEditing(false);
                setEditedName(tag.name);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div
      className={cn(
        'group/item flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent cursor-pointer',
        isSelected() && 'bg-accent'
      )}
      onClick={handleTagClick}
    >
      <div className="flex flex-1 items-center justify-between">
        <Tag className="truncate" text={tag.name}>
          {tag.name}
        </Tag>
        <div className="flex items-center relative w-8">
          <div className="absolute right-1 text-center text-xs text-muted-foreground group-hover/item:hidden">
            {tag.memoCount}
          </div>
          <div className="absolute right-0 opacity-0 group-hover/item:opacity-100">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-accent-foreground"
                >
                  <MoreVertical size={16} />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  >
                    <Pencil size={16} className="mr-2" />
                    编辑
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onClick={handleDelete}
                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  >
                    <Trash2 size={16} className="mr-2" />
                    删除
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagItemContainer;
