'use client';

import * as React from 'react';
import { motion, type Transition } from 'framer-motion';
import { cn } from '@/lib/utils';

type TabsContextType = {
  activeValue: string;
  handleValueChange: (value: string) => void;
  registerTrigger: (value: string, node: HTMLElement | null) => void;
};

const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

export function useTabs(): TabsContextType {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabsProvider');
  }
  return context;
}

type TabsProps = React.ComponentProps<'div'> & {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

export const AnimatedTabs = ({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
  ...props
}: TabsProps) => {
  const [activeValue, setActiveValue] = React.useState<string>(
    value ?? defaultValue ?? ''
  );
  const triggersRef = React.useRef(new Map<string, HTMLElement>());
  const initialSet = React.useRef(false);
  const isControlled = value !== undefined;

  React.useEffect(() => {
    if (
      !isControlled &&
      activeValue === '' &&
      triggersRef.current.size > 0 &&
      !initialSet.current
    ) {
      const firstTab = Array.from(triggersRef.current.keys())[0];
      if (firstTab) {
        setActiveValue(firstTab);
        initialSet.current = true;
      }
    }
  }, [activeValue, isControlled]);

  React.useEffect(() => {
    if (isControlled && value) {
      setActiveValue(value);
    }
  }, [value, isControlled]);

  const registerTrigger = (triggerValue: string, node: HTMLElement | null) => {
    if (node) {
      triggersRef.current.set(triggerValue, node);
      if (!isControlled && activeValue === '' && !initialSet.current) {
        setActiveValue(triggerValue);
        initialSet.current = true;
      }
    } else {
      triggersRef.current.delete(triggerValue);
    }
  };

  const handleValueChange = (val: string) => {
    if (!isControlled) setActiveValue(val);
    onValueChange?.(val);
  };

  const currentActiveValue = value ?? activeValue;

  return (
    <TabsContext.Provider
      value={{
        activeValue: currentActiveValue,
        handleValueChange,
        registerTrigger,
      }}
    >
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

export type TabsListProps = React.ComponentProps<'div'> & {
  children: React.ReactNode;
  activeClassName?: string;
  transition?: Transition;
};

export const AnimatedTabsList = ({
  children,
  className,
  activeClassName,
  transition = {
    type: 'spring',
    stiffness: 200,
    damping: 25,
  },
  ...props
}: TabsListProps) => {
  return (
    <div
      className={cn(
        'relative inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground w-full',
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            activeClassName,
            transition,
          });
        }
        return child;
      })}
    </div>
  );
};

export type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  children: React.ReactNode;
  activeClassName?: string;
  transition?: Transition;
};

export const AnimatedTabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, children, className, activeClassName, transition, ...props }, ref) => {
    const { activeValue, handleValueChange, registerTrigger } = useTabs();
    const localRef = React.useRef<HTMLButtonElement>(null);
    const isActive = activeValue === value;

    React.useImperativeHandle(ref, () => localRef.current as HTMLButtonElement);

    React.useEffect(() => {
      if (localRef.current) {
        registerTrigger(value, localRef.current);
      }
      return () => registerTrigger(value, null);
    }, [value, registerTrigger]);

    return (
      <button
        ref={localRef}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => handleValueChange(value)}
        data-state={isActive ? 'active' : 'inactive'}
        className={cn(
          'relative inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-1 z-[1]',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
          className
        )}
        {...props}
      >
        {isActive && (
          <motion.span
            layoutId="bubble"
            className={cn(
              'absolute inset-0 z-[-1] rounded-sm bg-background shadow-sm',
              activeClassName
            )}
            transition={transition || { type: 'spring', stiffness: 200, damping: 25 }}
          />
        )}
        {children}
      </button>
    );
  }
);
AnimatedTabsTrigger.displayName = 'AnimatedTabsTrigger';

export type TabsContentsProps = React.ComponentProps<'div'> & {
  children: React.ReactNode;
  transition?: Transition;
};

export const AnimatedTabsContents = ({
  children,
  className,
  transition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  },
  ...props
}: TabsContentsProps) => {
  const { activeValue } = useTabs();
  const childrenArray = React.Children.toArray(children);
  const activeIndex = childrenArray.findIndex(
    (child): child is React.ReactElement<{ value: string }> =>
      React.isValidElement(child) &&
      typeof child.props === 'object' &&
      child.props !== null &&
      'value' in child.props &&
      (child.props as { value: string }).value === activeValue
  );

  return (
    <div className={cn('relative w-full overflow-hidden', className)} {...props}>
      <motion.div
        className="flex w-full"
        animate={{ x: `-${Math.max(0, activeIndex) * 100}%` }}
        transition={transition}
      >
        {childrenArray.map((child, index) => (
          <div key={index} className="w-full shrink-0">
            {child}
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string;
  children: React.ReactNode;
};

export const AnimatedTabsContent = ({
  children,
  value,
  className,
  ...props
}: TabsContentProps) => {
  const { activeValue } = useTabs();
  const isActive = activeValue === value;
  
  if (!isActive) return null;
  
  return (
    <div
      role="tabpanel"
      data-state="active"
      className={cn('w-full', className)}
      {...props}
    >
      {children}
    </div>
  );
};
