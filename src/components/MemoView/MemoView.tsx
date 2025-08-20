'use client';
import React, { useMemo, useState, useCallback } from 'react';
import Tag from '../Tag';
import MemoActionMenu from './MemoActionMenu';
import { Card } from '@/components/ui/card';
import { convertGMTDateToLocal, parseContent } from '@/utils/parser';
import "@github/relative-time-element";
import Editor from '../Editor';
import useMemoStore from '@/store/memo';
import { useRequest } from 'ahooks';
import ImageViewer from '../ImageViewer';
import { updateMemoAction } from '../../api/dbActions';
import Link from 'next/link';
import { Note, NewMemo } from '../../api/type';

interface MemoContentProps {
  content: string;
}

const MemoContent = React.memo(({ content }: MemoContentProps) => (
  <div className="text-sm space-y-1">
    {content.split('\n').map((text, index) => (
      <p key={index} className="whitespace-pre-wrap break-words leading-6">
        {parseContent(text).map((subItem, subIndex) => (
          subItem.type !== 'tag' ? (
            <span key={subItem.text + subIndex}>{subItem.text}</span>
          ) : null
        ))}
      </p>
    ))}
  </div>
));

MemoContent.displayName = 'MemoContent';

const MemoView = ({
  tags,
  content,
  images = [],
  link,
  createdAt,
  updatedAt,
  id,
}: Note) => {
  const parsedImages = useMemo(() => {
    return images || [];
  }, [images]);
  const [isEdited, setIsEdited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const time = useMemo(() => {
    return updatedAt ? convertGMTDateToLocal(updatedAt) : ' ';
  }, [updatedAt]);

  const { updateMemo } = useMemoStore();

  // Create the complete memo object to pass to MemoActionMenu
  const currentMemo: Note = useMemo(() => ({
    id,
    content,
    images: parsedImages,
    link,
    createdAt,
    updatedAt,
    deletedAt: null, // This memo is visible, so it's not deleted
    embedding: null,
    tags
  }), [id, content, parsedImages, link, createdAt, updatedAt, tags]);

  const { runAsync: updateRecord } = useRequest(updateMemoAction, {
    manual: true,
    onSuccess: (id) => {
      if (id) {
        updateMemo(String(id));
        setIsEdited(false);
      }
    }
  });

  const isRecentTime = useMemo(() => {
    return createdAt ? Date.now() - new Date(createdAt).getTime() < 1000 * 60 * 60 * 24 : false;
  }, [createdAt]);

  const handleEdit = useCallback(() => setIsEdited(true), []);
  const handleCancel = useCallback(() => setIsEdited(false), []);

  const handleSubmit = useCallback(async (memo: NewMemo) => {
    setIsLoading(true);
    try {
      await updateRecord(id, memo);
    } finally {
      setIsLoading(false);
    }
  }, [id, updateRecord]);

  if (isEdited) {
    const editorLink = link ? {
      link: link.link,
      text: link.text,
      id: String(link.id),
      memoId: String(link.memoId),
      createdAt: link.createdAt
    } : undefined;
    
    return <Editor
      defaultValue={content}
      defaultImages={parsedImages}
      defaultLink={editorLink}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  }
  return (
    <Card id={`memo-${id}`} className={`p-3 relative h-full flex flex-col ${isLoading ? 'opacity-70' : ''}`}>
      <div className="flex justify-between items-start flex-1">
        <div className="flex-1 min-w-0">
          <MemoContent content={content} />
        </div>
        <MemoActionMenu
          memoId={String(id)}
          originalMemo={currentMemo}
          onEdit={handleEdit}
          parsedContent={content.split('\n').map(text => parseContent(text))}
        />
      </div>
      {parsedImages.length > 0 && (
        <div className="grid grid-cols-2 gap-1 mt-2">
          {parsedImages.map((image: string) => (
              <ImageViewer
              key={image}
              src={image}
              alt={image}
            />
          ))}
        </div>
      )}

      {link?.link && (
        <div className='mt-3'>
          <Link
            href={link.link}
            target="_blank"
            rel="noopener noreferrer"
            title={link.text || link.link}
            className="text-blue-500 hover:text-blue-600 hover:underline truncate block text-sm transition-colors"
          >
            {link.text || link.link}
          </Link>
        </div>
      )}

      {/* Tags and time in the same row - always at bottom */}
      <div className="flex justify-between items-end mt-auto pt-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Tag
              key={tag.id}
              className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
              text={tag.name}
            >
              #{tag.name}
            </Tag>
          ))}
        </div>
        <div className="text-xs text-gray-500 flex-shrink-0">
          {isRecentTime ? (
            <time dateTime={createdAt as unknown as string}>
              {new Date(createdAt as unknown as string).toLocaleString()}
            </time>
          ) : time}
        </div>
      </div>
    </Card>
  );
};

export default MemoView;
