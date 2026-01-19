import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxFlow, FlowNode, FlowEdge } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

export const useInboxFlows = () => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const [flows, setFlows] = useState<InboxFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('inbox_flows')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setFlows((data || []).map(flow => ({
        ...flow,
        nodes: (flow.nodes as any[]) || [],
        edges: (flow.edges as any[]) || [],
        trigger_type: flow.trigger_type as 'keyword' | 'all' | 'schedule',
        trigger_keywords: flow.trigger_keywords || [],
        assigned_instances: flow.assigned_instances || [],
        pause_schedule_enabled: flow.pause_schedule_enabled || false,
        pause_schedule_start: flow.pause_schedule_start || null,
        pause_schedule_end: flow.pause_schedule_end || null,
        reply_to_last_message: flow.reply_to_last_message || false,
        reply_mode: (flow.reply_mode as 'all' | 'interval') || 'all',
        reply_interval: flow.reply_interval || 3,
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, user?.id]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const createFlow = async (name: string, description?: string) => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return { error: 'Not authenticated' };

    try {
      const { data, error: insertError } = await supabase
        .from('inbox_flows')
        .insert({
          user_id: userId,
          name,
          description,
          nodes: [],
          edges: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const newFlow: InboxFlow = {
        ...data,
        nodes: [],
        edges: [],
        trigger_type: 'keyword',
        trigger_keywords: [],
        assigned_instances: [],
        reply_mode: (data.reply_mode as 'all' | 'interval') || 'all',
        reply_interval: data.reply_interval || 3,
      };

      setFlows(prev => [newFlow, ...prev]);
      return { data: newFlow };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const updateFlow = async (flowId: string, updates: Partial<InboxFlow>) => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return { error: 'Not authenticated' };

    try {
      const updateData: any = { ...updates, updated_at: new Date().toISOString() };
      
      const { data, error: updateError } = await supabase
        .from('inbox_flows')
        .update(updateData)
        .eq('id', flowId)
        .select()
        .single();

      if (updateError) throw updateError;

      setFlows(prev => prev.map(f => f.id === flowId ? {
        ...data,
        nodes: (data.nodes as any[]) || [],
        edges: (data.edges as any[]) || [],
        trigger_type: data.trigger_type as 'keyword' | 'all' | 'schedule',
        trigger_keywords: data.trigger_keywords || [],
        assigned_instances: data.assigned_instances || [],
        pause_schedule_enabled: data.pause_schedule_enabled || false,
        pause_schedule_start: data.pause_schedule_start || null,
        pause_schedule_end: data.pause_schedule_end || null,
        reply_to_last_message: data.reply_to_last_message || false,
        reply_mode: (data.reply_mode as 'all' | 'interval') || 'all',
        reply_interval: data.reply_interval || 3,
      } : f));

      return { data };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const deleteFlow = async (flowId: string) => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return { error: 'Not authenticated' };

    try {
      const { error: deleteError } = await supabase
        .from('inbox_flows')
        .delete()
        .eq('id', flowId);

      if (deleteError) throw deleteError;

      setFlows(prev => prev.filter(f => f.id !== flowId));
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const toggleFlowActive = async (flowId: string, isActive: boolean) => {
    return updateFlow(flowId, { is_active: isActive });
  };

  return { 
    flows, 
    loading, 
    error, 
    refetch: fetchFlows, 
    createFlow, 
    updateFlow, 
    deleteFlow,
    toggleFlowActive 
  };
};
