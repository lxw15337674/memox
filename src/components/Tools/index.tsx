import React from 'react';
import TagsSection from './TagsSection';
import Count from './Count';
import ActivityCalendar from '../ActivityCalendar';
import { SearchInput } from './SearchInput';
import { Button } from '../ui/button';
import Icon from '../Icon';
import { useState } from 'react';

interface ToolsProps {
  onInsightClick?: () => void;
}

const Tools: React.FC<ToolsProps> = ({ onInsightClick }) => {
  return (
    <div className="space-y-4">
      <SearchInput />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onInsightClick}
          className="flex items-center gap-2"
        >
          <Icon.Brain size={16} />
          AI洞察
        </Button>
      </div>
      <Count />
      <ActivityCalendar />
      <TagsSection />
    </div>
  );
};

export default Tools;
