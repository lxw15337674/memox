import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Wand2Icon } from 'lucide-react';
import Icon from '../Icon';
import { useToast } from '../ui/use-toast';
import { polishContent } from '../../api/aiActions';
import { Card } from "@/components/ui/card";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from 'react';

interface Props {
  originalText: string;
  onTextChange: (text: string) => void;
}

export const AIPolishPreview = ({ originalText, onTextChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [polishedText, setPolishedText] = useState<string>('');
  const [open, setOpen] = useState(false);
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
      setOpen(true);
      toast({
        title: '润色完成',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: '润色失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    onTextChange(text);
    toast({
      title: '已复制到编辑器',
      variant: 'default',
    });
    setOpen(false);
  };

  const parsePolishedText = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const result = {
      styles: [] as string[],
      names: [] as string[]
    };

    lines.forEach(line => {
      const match = line.trim().match(/^\[(.*?)\](.+)$/);
      if (match) {
        result.names.push(match[1]);
        result.styles.push(match[2].trim());
      }
    });

    return result;
  };

  const { styles, names } = useMemo(() =>
    parsePolishedText(polishedText),
    [polishedText]
  );

  return (
    <Popover open={open && !loading} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="AI 润色文本"
          disabled={loading}
          onClick={handlePolish}
        >
          {loading ? (
            <Icon.Loader2 className="animate-spin" size={18} />
          ) : (
            <Wand2Icon size={18} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[90vw] w-fit p-4 max-h-[80vh] overflow-y-auto" align="start" side="bottom">
        <div className="space-y-2">
          {styles.map((style, index) => (
            <Card key={index} className="p-2 hover:bg-accent/50 transition-colors">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  {names[index] && (
                    <div className="inline-block px-2 py-0.5 mb-2 text-xs rounded-md bg-muted text-muted-foreground">
                      {names[index]}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{style}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleCopy(style)}
                  title="复制到编辑器"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
