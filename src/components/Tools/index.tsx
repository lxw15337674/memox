import React from 'react';
import TagsSection from './TagsSection';
import Count from './Count';
import ActivityCalendar from '../ActivityCalendar';
import { SearchInput } from './SearchInput';

const Tools: React.FC = () => {
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
