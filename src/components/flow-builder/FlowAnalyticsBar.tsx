import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFlowAnalytics, DateFilter } from '@/hooks/useFlowAnalytics';
import { Loader2, Users, TrendingUp } from 'lucide-react';

interface FlowAnalyticsBarProps {
  flowId: string;
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
}

export const FlowAnalyticsBar = ({ flowId, dateFilter, onDateFilterChange }: FlowAnalyticsBarProps) => {
  const { analytics, loading } = useFlowAnalytics(flowId, dateFilter);

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b border-border">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        <Select value={dateFilter} onValueChange={(value) => onDateFilterChange(value as DateFilter)}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="yesterday">Ontem</SelectItem>
            <SelectItem value="last7days">Últimos 7 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : analytics ? (
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {analytics.totalSessions} sessões
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {analytics.conversionRate.toFixed(1)}% finalizaram
          </Badge>
        </div>
      ) : null}
    </div>
  );
};
