import { Badge } from '@/components/ui/badge';
import { NodeAnalytics } from '@/hooks/useFlowAnalytics';
import { Users, Percent } from 'lucide-react';

interface NodeAnalyticsBadgeProps {
  analytics: NodeAnalytics | undefined;
  totalFlowSessions: number;
}

export const NodeAnalyticsBadge = ({ analytics, totalFlowSessions }: NodeAnalyticsBadgeProps) => {
  if (!analytics || analytics.uniqueSessions === 0) {
    return null;
  }

  const percentage = totalFlowSessions > 0 
    ? ((analytics.uniqueSessions / totalFlowSessions) * 100).toFixed(0)
    : '0';

  return (
    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 flex items-center gap-1 pointer-events-none">
      <Badge 
        variant="outline" 
        className="bg-background/90 backdrop-blur-sm text-[10px] px-1.5 py-0 h-5 flex items-center gap-1"
      >
        <Users className="h-2.5 w-2.5" />
        {analytics.uniqueSessions}
      </Badge>
      <Badge 
        variant="secondary" 
        className="bg-primary/20 text-primary text-[10px] px-1.5 py-0 h-5 flex items-center gap-1"
      >
        <Percent className="h-2.5 w-2.5" />
        {percentage}%
      </Badge>
    </div>
  );
};
