import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveFlowSession {
  id: string;
  flow_id: string;
  flow_name: string;
  current_node_id: string | null;
  status: string;
  timeout_at: string | null;
  next_run_at: string | null;
}

interface UseActiveFlowSessionResult {
  session: ActiveFlowSession | null;
  countdown: number | null; // seconds remaining
  loading: boolean;
}

export function useActiveFlowSession(contactId: string | null): UseActiveFlowSessionResult {
  const [session, setSession] = useState<ActiveFlowSession | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchActiveSession = useCallback(async () => {
    if (!contactId) {
      setSession(null);
      setCountdown(null);
      return;
    }

    setLoading(true);
    try {
      // Get active session for this contact
      const { data: sessionData, error: sessionError } = await supabase
        .from('inbox_flow_sessions')
        .select(`
          id,
          flow_id,
          current_node_id,
          status,
          timeout_at,
          variables,
          inbox_flows!inner(name)
        `)
        .eq('contact_id', contactId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        console.error('Error fetching active session:', sessionError);
        setSession(null);
        setCountdown(null);
        return;
      }

      if (!sessionData) {
        setSession(null);
        setCountdown(null);
        return;
      }

      // Check for delay job
      const { data: delayJob } = await supabase
        .from('inbox_flow_delay_jobs')
        .select('run_at, status')
        .eq('session_id', sessionData.id)
        .eq('status', 'scheduled')
        .maybeSingle();

      // Calculate next run time from either delay job or timeout_at
      let nextRunAt: string | null = null;
      
      if (delayJob?.run_at) {
        nextRunAt = delayJob.run_at;
      } else if (sessionData.timeout_at) {
        nextRunAt = sessionData.timeout_at;
      } else {
        // Check variables for _pendingDelay
        const variables = sessionData.variables as Record<string, any> | null;
        if (variables?._pendingDelay?.resumeAt) {
          nextRunAt = new Date(variables._pendingDelay.resumeAt).toISOString();
        }
      }

      const flowName = (sessionData as any).inbox_flows?.name || 'Fluxo desconhecido';

      setSession({
        id: sessionData.id,
        flow_id: sessionData.flow_id,
        flow_name: flowName,
        current_node_id: sessionData.current_node_id,
        status: sessionData.status,
        timeout_at: sessionData.timeout_at,
        next_run_at: nextRunAt,
      });

      // Calculate initial countdown
      if (nextRunAt) {
        const diff = new Date(nextRunAt).getTime() - Date.now();
        setCountdown(diff > 0 ? Math.ceil(diff / 1000) : null);
      } else {
        setCountdown(null);
      }
    } catch (err) {
      console.error('Error in useActiveFlowSession:', err);
      setSession(null);
      setCountdown(null);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  // Initial fetch
  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  // Subscribe to session changes
  useEffect(() => {
    if (!contactId) return;

    const channel = supabase
      .channel(`active-session-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_flow_sessions',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          fetchActiveSession();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, fetchActiveSession]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          // Refetch when countdown reaches 0
          fetchActiveSession();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown, fetchActiveSession]);

  return { session, countdown, loading };
}

// Format countdown for display
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
