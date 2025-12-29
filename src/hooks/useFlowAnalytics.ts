import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, subDays } from 'date-fns';

export interface NodeAnalytics {
  nodeId: string;
  nodeType: string;
  totalVisitors: number;
  uniqueSessions: number;
}

export interface FlowAnalytics {
  flowId: string;
  nodeStats: Map<string, NodeAnalytics>;
  totalSessions: number;
  completedSessions: number;
  conversionRate: number;
}

export type DateFilter = 'today' | 'yesterday' | 'last7days';

export const useFlowAnalytics = (flowId: string, dateFilter: DateFilter = 'today') => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<FlowAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const getDateRange = useCallback((filter: DateFilter): { start: Date; end: Date } => {
    // Calculate current time in São Paulo timezone (UTC-3)
    const nowUtc = new Date();
    
    // Get São Paulo offset: -3 hours = -180 minutes
    const SP_OFFSET_MINUTES = -180;
    
    // Calculate what time it is in São Paulo right now
    const browserOffsetMinutes = nowUtc.getTimezoneOffset();
    const totalOffsetMs = (browserOffsetMinutes - SP_OFFSET_MINUTES) * 60 * 1000;
    
    // Create a date object representing São Paulo local time
    const nowInSaoPaulo = new Date(nowUtc.getTime() + totalOffsetMs);
    
    // Get start of day in São Paulo
    const todayStartSaoPaulo = startOfDay(nowInSaoPaulo);
    
    // Convert São Paulo times back to UTC for database queries
    const todayStartUtc = new Date(todayStartSaoPaulo.getTime() - totalOffsetMs);
    
    switch (filter) {
      case 'today':
        return { start: todayStartUtc, end: nowUtc };
      case 'yesterday':
        const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
        return { start: yesterdayStartUtc, end: todayStartUtc };
      case 'last7days':
        const sevenDaysAgoUtc = new Date(todayStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: sevenDaysAgoUtc, end: nowUtc };
      default:
        return { start: todayStartUtc, end: nowUtc };
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (!user || !flowId) return;

    setLoading(true);
    try {
      const { start, end } = getDateRange(dateFilter);

      // Fetch analytics data
      const { data: analyticsData, error: analyticsError } = await supabase
        .from('inbox_flow_analytics')
        .select('*')
        .eq('flow_id', flowId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (analyticsError) throw analyticsError;

      // Fetch session counts
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('inbox_flow_sessions')
        .select('id, status')
        .eq('flow_id', flowId)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString());

      if (sessionsError) throw sessionsError;

      // Process analytics data
      const nodeStats = new Map<string, NodeAnalytics>();
      const sessionsByNode = new Map<string, Set<string>>();

      (analyticsData || []).forEach((record: { node_id: string; node_type: string; session_id: string }) => {
        const nodeId = record.node_id;
        
        if (!nodeStats.has(nodeId)) {
          nodeStats.set(nodeId, {
            nodeId,
            nodeType: record.node_type,
            totalVisitors: 0,
            uniqueSessions: 0,
          });
          sessionsByNode.set(nodeId, new Set());
        }

        const stats = nodeStats.get(nodeId)!;
        stats.totalVisitors++;
        
        sessionsByNode.get(nodeId)!.add(record.session_id);
      });

      // Update unique session counts
      nodeStats.forEach((stats, nodeId) => {
        stats.uniqueSessions = sessionsByNode.get(nodeId)?.size || 0;
      });

      const totalSessions = sessionsData?.length || 0;
      const completedSessions = sessionsData?.filter((s: { status: string }) => s.status === 'completed').length || 0;
      const conversionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

      setAnalytics({
        flowId,
        nodeStats,
        totalSessions,
        completedSessions,
        conversionRate,
      });
    } catch (error) {
      console.error('Error fetching flow analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [user, flowId, dateFilter, getDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!flowId) return;

    const channel = supabase
      .channel(`flow-analytics-${flowId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_flow_analytics',
          filter: `flow_id=eq.${flowId}`,
        },
        () => {
          fetchAnalytics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [flowId, fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
};
