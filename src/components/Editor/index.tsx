'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import TagSuggestions from './TagSuggestions';
import { Button } from '../ui/button';
import { useDebounceFn, useEventListener, useKeyPress, useUpdateEffect, useSafeState, useUnmount, useThrottleFn } from 'ahooks';
import { useFileUpload } from './useFileUpload';
import ImageViewer from '../ImageViewer';
import { PhotoProvider } from 'react-photo-view';
import LinkAction, { LinkType } from './LinkAction';
import { AutosizeTextarea } from '../ui/AutosizeTextarea';
import { LucideIcon } from 'lucide-react';
import { Link } from '@prisma/client';
import { NewMemo } from '../../api/type';
import { AIPolishPreview } from './AIPolishPreview';

interface Props {
  onSubmit: (memo: NewMemo) => Promise<any>;
  onCancel?: () => void;
  defaultValue?: string;
  defaultImages?: string[];
  defaultLink?: Link;
  onChange?: (content: string, images?: string[]) => void;
  autoFocus?: boolean;
}
export interface ReplaceTextFunction {
  (text: string, start: number, end: number, cursorOffset?: number): void
}

interface ToolbarButtonProps {
  icon: LucideIcon;
  title: string; 
  onClick: () => void;
  disabled?: boolean;
}

// Extract toolbar buttons into a separate component
const ToolbarButton = ({ icon: Icon, title, onClick, disabled = false }: ToolbarButtonProps) => (
  <Button
    variant="ghost"
    size="icon"
    title={title}
    onClick={onClick}
    disabled={disabled}
  >
    <Icon size={18} />
  </Button>
);

const Editor = ({ onSubmit, defaultValue, onCancel, defaultImages, defaultLink, onChange, autoFocus = true }: Props) => {
  const [loading, setLoading] = useSafeState(false);
  const [editorRef, setEditorRef] = useState<HTMLTextAreaElement | null>(null);
  const { files, uploadFile, removeFile, isUploading, reset, pushFile } = useFileUpload(defaultImages)
  const [link, setLink] = useState<LinkType | undefined>(defaultLink)
  
  // Track content changes for better persistence
  const [content, setContent] = useState(defaultValue || '');
  
  // Update content state
  const handleContentChange = (value: string) => {
    setContent(value);
    if (onChange) {
      onChange(value, files?.map(item => item.source));
    }
  };
  
  // Update when files change
  useUpdateEffect(() => {
    if (onChange) {
      onChange(content, files?.map(item => item.source));
    }
  }, [files]);
  
  // Save content before unmounting
  useUnmount(() => {
    if (onChange) {
      onChange(content, files?.map(item => item.source));
    }
  });

  const { run: replaceText } = useDebounceFn<ReplaceTextFunction>((text, start, end, offset = 0) => {
    const editor = editorRef;
    if (editor) {
      const value = editor.value;
      const newValue = value.slice(0, start) + `${text} ` + value.slice(end);
      editor.value = newValue;
      handleContentChange(newValue);
      
      setTimeout(() => {
        editor.selectionStart = start + text.length + offset;
        editor.selectionEnd = start + text.length + offset;
        editor.focus();
      }, 100);
    }
  }, { wait: 200 });
  const [isFocused, setIsFocused] = useSafeState(false);
  const isLoading = loading || isUploading;
  
  // Helper function to focus and move cursor to the end
  const focusEditorAtEnd = () => {
    if (editorRef) {
      editorRef.focus();
      const textLength = editorRef.value.length;
      editorRef.selectionStart = textLength;
      editorRef.selectionEnd = textLength;
    }
  };
  
  const onSave = async () => {
    if (!content.trim()) {
      return;
    }
    
    setLoading(true); 
    await onSubmit?.(
      {
        content,
        images: files?.map(item => item.source),
        link
      }).finally(() => {
        setLoading(false);
      });
    
    // Clear the form
    setContent('');
    reset();
    setLink(undefined);
    
    // Notify parent that content has been cleared
    if (onChange) {
      onChange('', []);
    }
  };
  useKeyPress('ctrl.enter', (e) => {
    // 判断是否focus
    if (editorRef === document.activeElement) {
      e.preventDefault();
      e.stopPropagation();
      onSave();
    }
  });

  const { run: handlePaste } = useThrottleFn(
    (e: ClipboardEvent) => {
      if (editorRef === document.activeElement && e.clipboardData) {
        const items = e.clipboardData.items;
        if (!items || items.length === 0) return;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') === 0) {
            pushFile(items[i].getAsFile()!);
          }
        }
      }
    },
    { wait: 300 }
  );

  useEventListener('paste', handlePaste);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleContentChange(e.target.value);
  };

  // Add autoFocus effect that moves cursor to the end
  useEffect(() => {
    if (autoFocus && editorRef) {
      focusEditorAtEnd();
    }
  }, [editorRef, autoFocus]);

  return (
    <div className={`relative w-auto overflow-x-hidden h-full border bg-background rounded-md transition-colors duration-200 ${isFocused ? 'border-blue-500' : 'border-input'}`}>
      <div className="flex flex-col h-full">
        <AutosizeTextarea
          className='resize-none border-none text-base  '
          placeholder="此刻的想法..."
          value={content}
          ref={(ref) => setEditorRef(ref?.textArea ?? null)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={handleChange}
        />

        <div className='px-3'>
          <PhotoProvider
            brokenElement={<div className="w-[164px] h-[164px] bg-gray-200 text-gray-400 flex justify-center items-center">图片加载失败</div>}
          >
            <div className='flex flex-wrap gap-2 pb-2'>
              {files?.map((file, index) => (
                <ImageViewer
                  key={file.source}
                  src={file.source}
                  loading={file.loading}
                  alt='file'
                  height={100}
                  width={100}
                  onDelete={() => removeFile(index)}
                />
              ))}
            </div>
          </PhotoProvider>

          <div className='flex items-center border-t py-1.5 gap-0.5'>
            <div className="flex items-center ">
              <ToolbarButton
                icon={Icon.ClipboardPaste}
                title='粘贴剪切板内容'
                onClick={() => {
                  if (!editorRef) return;
                  editorRef.focus();
                  navigator.clipboard.readText().then(text => {
                    const start = editorRef.selectionStart || 0;
                    const end = editorRef.selectionEnd || 0;
                    const newContent = content.slice(0, start) + text + content.slice(end);
                    setContent(newContent);
                    handleContentChange(newContent);
                    
                    setTimeout(() => {
                      if (editorRef) {
                        editorRef.selectionStart = start + text.length;
                        editorRef.selectionEnd = start + text.length;
                      }
                    }, 100);
                  });
                }}
              />
              <AIPolishPreview
                originalText={content}
                onTextChange={(text) => {
                  handleContentChange(text);
                  if (editorRef) {
                    focusEditorAtEnd();
                  }
                }}
              />
              <ToolbarButton
                icon={Icon.Hash}
                title='插入标签'
                onClick={() => {
                  if (!editorRef) return;
                  editorRef.focus();
                  const start = editorRef.selectionStart || 0;
                  const end = editorRef.selectionEnd || 0;
                  const newContent = content.slice(0, start) + '#' + content.slice(end);
                  setContent(newContent);
                  handleContentChange(newContent);
                  
                  setTimeout(() => {
                    if (editorRef) {
                      editorRef.selectionStart = start + 1;
                      editorRef.selectionEnd = start + 1;
                    }
                  }, 100);
                }}
              />
              <ToolbarButton
                icon={Icon.Paperclip}
                title='插入图片，最大9张，单张最大20MB'
                onClick={() => {
                  if (!editorRef) return;
                  uploadFile();
                }}
                disabled={files?.length >= 9}
              />
              <LinkAction link={link} setLink={setLink} />
            </div>

            <div className="flex items-center gap-1 ml-auto">
              {onCancel ?(
                <Button
                  disabled={loading}
                  variant="ghost"
                  size="icon"
                  onClick={onCancel}
                  title="取消"
                >
                  <Icon.X size={18} />
                </Button>
              ):
              <Button
                variant="ghost"
                size="icon"
                title="清空"
                onClick={() => {
                  setContent('');
                  reset();
                  setLink(undefined);
                  if (onChange) {
                    onChange('', []);
                  }
                  if (editorRef) {
                    focusEditorAtEnd();
                  }
                }}
                disabled={isLoading || (!content && !files?.length && !link)}
              >
                <Icon.Trash2 size={18} />
              </Button>}
              <Button
                disabled={isLoading}
                variant="outline"
                onClick={onSave}
                className="px-4 gap-2"
              >
                {isLoading ? (
                  <Icon.Loader2 size={18} className="animate-spin " />
                ) : (
                  <Icon.Send size={18}/>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <TagSuggestions 
        editorRef={editorRef} 
        replaceText={replaceText} 
        content={content}
        onContentChange={handleContentChange}
      />
    </div>
  );
};

export default Editor;
