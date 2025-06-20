'use client';
import classNames from 'classnames';
import NavigationDrawer from './NavigationDrawer';
import useIsMobile from '@/hooks/useIsMobile';
import { ModeToggle } from './LeftSide/ModeToggle';
import { Setting } from './LeftSide/Setting';

interface Props {
  className?: string;
  children?: React.ReactNode;
}

const MobileHeader = (props: Props) => {
  const { className } = props;
  const isMobile = useIsMobile();
  if (!isMobile) {
    return null;
  }
  return (
    <div
      className={classNames(
        'sticky top-0 px-4 py-2  bg-opacity-80 backdrop-blur-lg flex md:hidden flex-row justify-between items-center w-full h-auto flex-nowrap shrink-0 z-1000 ',
        className,
      )}
    >
      <div className="flex flex-row justify-start items-center mr-2 shrink-0 overflow-hidden">
        <NavigationDrawer />
      </div>
      <div className="flex flex-row justify-end items-center ">
        <div className='mr-1'>
          <ModeToggle />
        </div>
        <Setting />
      </div>
    </div>
  );
};

export default MobileHeader;
