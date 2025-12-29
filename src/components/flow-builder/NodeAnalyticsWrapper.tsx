import { ReactNode } from 'react';

interface NodeAnalyticsWrapperProps {
  children: ReactNode;
  nodeId: string;
  className?: string;
}

export const NodeAnalyticsWrapper = ({ children, className = '' }: NodeAnalyticsWrapperProps) => {
  return (
    <div className={`relative ${className}`}>
      {children}
    </div>
  );
};