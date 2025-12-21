import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxFlow, FlowNode, FlowEdge } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';

export const useInboxFlows = () => {
  const { user } = useAuth();
  const [flows, setFlows] = useState<InboxFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('inbox_flows')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setFlows((data || []).map(flow => ({
        ...flow,
        nodes: (flow.nodes as any[]) || [],
        edges: (flow.edges as any[]) || [],
        trigger_type: flow.trigger_type as 'keyword' | 'all' | 'schedule',
        trigger_keywords: flow.trigger_keywords || [],
        assigned_instances: flow.assigned_instances || [],
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const createFlow = async (name: string, description?: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { data, error: insertError } = await supabase
        .from('inbox_flows')
        .insert({
          user_id: user.id,
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
      };

      setFlows(prev => [newFlow, ...prev]);
      return { data: newFlow };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const updateFlow = async (flowId: string, updates: Partial<InboxFlow>) => {
    if (!user) return { error: 'Not authenticated' };

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
      } : f));

      return { data };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const deleteFlow = async (flowId: string) => {
    if (!user) return { error: 'Not authenticated' };

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
