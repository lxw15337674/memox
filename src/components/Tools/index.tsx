import React from 'react';
import TagsSection from './TagsSection';
import Count from './Count';
import ActivityCalendar from '../ActivityCalendar';
import { SearchInput } from './SearchInput';
import { Note, TagWithCount, MemosCount } from '@/api/type';

interface ToolsProps {
  initialData?: {
    memos: {
      items: Note[];
      total: number;
    };
    tags: TagWithCount[];
    counts: MemosCount;
  };
}

const Tools: React.FC<ToolsProps> = ({ initialData }) => {
  return (
    <div className="space-y-4">
      <SearchInput />
      <Count />
      <ActivityCalendar />
      <TagsSection />
    </div>
  );
};

export default Tools;
