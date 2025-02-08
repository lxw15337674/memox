import React from 'react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Wand2Icon } from 'lucide-react';
import Icon from '../Icon';
import { useToast } from '../ui/use-toast';
import { polishContent } from '../../api/aiActions';

interface Props {
  originalText: string;
  onTextChange: (text: string) => void;
}

export const AIPolishPreview = ({ originalText, onTextChange }: Props) => {
  const [loading, setLoading] = React.useState(false);
  const [polishedText, setPolishedText] = React.useState<string>();
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();

  const handlePolish = async () => {
    if (!originalText.trim()) {
      toast({
        title: '内容不能为空',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await polishContent(originalText);
      setPolishedText(result);
      toast({
        title: '润色完成',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: '润色失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setPolishedText(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="AI 润色文本"
          disabled={loading || !originalText}
                  onClick={ handlePolish}
        >
          <Wand2Icon size={18} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[90vw] w-fit p-4" align="start" side="bottom">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">原文</h4>
            <div className="rounded-md bg-muted p-3 text-sm max-w-[600px]">
              {originalText}
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">润色后</h4>
            <div className="rounded-md bg-muted p-3 text-sm min-h-[100px] max-w-[600px]">
              {loading ? (
                <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                  <Icon.Loader2 className="animate-spin" size={16} />
                  <span>正在润色...</span>
                </div>
              ) : polishedText}
            </div>
          </div>

          {polishedText && !loading && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>
                取消
              </Button>
              <Button onClick={() => {
                onTextChange(polishedText);
                handleClose();
              }}>
                应用润色
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
