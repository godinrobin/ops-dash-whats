import { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { useFlowAnalyticsContext } from './FlowAnalyticsContext';
import { SlidingNumber } from '@/components/ui/sliding-number';

interface NodeAnalyticsWrapperProps {
  children: ReactNode;
  nodeId: string;
  className?: string;
}

export const NodeAnalyticsWrapper = ({ children, nodeId, className = '' }: NodeAnalyticsWrapperProps) => {
  const { nodeStats, totalSessions, isLoading } = useFlowAnalyticsContext();
  const analytics = nodeStats.get(nodeId);
  
  const hasData = analytics && analytics.uniqueSessions > 0;
  const percentage = totalSessions > 0 && analytics 
    ? Math.round((analytics.uniqueSessions / totalSessions) * 100)
    : 0;

  return (
    <div className={`relative ${className}`}>
      {/* Analytics badge */}
      {(hasData || isLoading) && (
        <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
          {isLoading ? (
            <Badge 
              variant="outline" 
              className="bg-background/90 backdrop-blur-sm text-[10px] px-1.5 py-0 h-5 flex items-center gap-1 animate-pulse"
            >
              <Users className="h-2.5 w-2.5" />
              <span className="w-4 h-2 bg-muted rounded" />
            </Badge>
          ) : hasData ? (
            <>
              <Badge 
                variant="outline" 
                className="bg-background/90 backdrop-blur-sm text-[10px] px-1.5 py-0 h-5 flex items-center gap-1"
              >
                <Users className="h-2.5 w-2.5" />
                <SlidingNumber value={analytics.uniqueSessions} className="text-[10px]" />
              </Badge>
              <Badge 
                variant="secondary" 
                className="bg-primary/20 text-primary text-[10px] px-1.5 py-0 h-5 flex items-center gap-0.5"
              >
                <SlidingNumber value={percentage} className="text-[10px]" />
                <span>%</span>
              </Badge>
            </>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
};