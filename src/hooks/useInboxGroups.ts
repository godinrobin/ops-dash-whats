import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

export interface InboxGroup {
  id: string;
  user_id: string;
  instance_id: string;
  group_jid: string;
  name: string;
  description?: string;
  profile_pic_url?: string;
  owner_jid?: string;
  participant_count: number;
  is_announce: boolean;
  is_community: boolean;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  // Instance info for display
  instance_name?: string;
}

export const useInboxGroups = (selectedInstanceId?: string) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  
  const [groups, setGroups] = useState<InboxGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch groups from database
  const fetchGroups = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      let query = supabase
        .from('inbox_groups')
        .select('*')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      
      if (selectedInstanceId) {
        query = query.eq('instance_id', selectedInstanceId);
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      // Get instance names for display
      const instanceIds = [...new Set((data || []).map(g => g.instance_id).filter(Boolean))];
      const instanceNames: Record<string, string> = {};
      
      if (instanceIds.length > 0) {
        const { data: instances } = await supabase
          .from('maturador_instances')
          .select('id, instance_name')
          .in('id', instanceIds);
        
        instances?.forEach(inst => {
          instanceNames[inst.id] = inst.instance_name;
        });
      }
      
      const groupsWithInstanceNames = (data || []).map(g => ({
        ...g,
        instance_name: g.instance_id ? instanceNames[g.instance_id] : undefined,
      }));
      
      setGroups(groupsWithInstanceNames as InboxGroup[]);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      setError(err.message || 'Erro ao buscar grupos');
    } finally {
      setLoading(false);
    }
  }, [userId, selectedInstanceId]);

  // Sync groups from WhatsApp API
  const syncGroups = useCallback(async () => {
    if (!userId) return;
    
    setSyncing(true);
    setError(null);
    
    try {
      // Get connected instances
      let instanceQuery = supabase
        .from('maturador_instances')
        .select('id, instance_name, api_provider, uazapi_token')
        .eq('user_id', userId)
        .in('status', ['connected', 'open']);
      
      if (selectedInstanceId) {
        instanceQuery = instanceQuery.eq('id', selectedInstanceId);
      }
      
      const { data: instances, error: instanceError } = await instanceQuery;
      
      if (instanceError) throw instanceError;
      if (!instances || instances.length === 0) {
        setGroups([]);
        return;
      }

      // Fetch groups from each instance via edge function
      for (const instance of instances) {
        try {
          const { data, error: fetchError } = await supabase.functions.invoke('maturador-evolution', {
            body: {
              action: 'fetch-groups',
              instanceId: instance.id,
            }
          });
          
          if (fetchError) {
            console.error(`Error fetching groups for ${instance.instance_name}:`, fetchError);
            continue;
          }
          
          if (data?.groups && Array.isArray(data.groups)) {
            // Upsert groups to database
            const groupsToUpsert = data.groups.map((g: any) => ({
              user_id: userId,
              instance_id: instance.id,
              group_jid: g.JID || g.id || g.jid,
              name: g.Name || g.subject || g.name || 'Grupo sem nome',
              description: g.Topic || g.desc || g.description || null,
              profile_pic_url: g.profilePictureUrl || g.pictureUrl || null,
              owner_jid: g.OwnerJID || g.owner || null,
              participant_count: g.Participants?.length || g.size || g.participants?.length || 0,
              is_announce: g.IsAnnounce || g.announce || false,
              is_community: g.IsCommunity || g.isCommunity || false,
              updated_at: new Date().toISOString(),
            }));

            for (const group of groupsToUpsert) {
              await supabase
                .from('inbox_groups')
                .upsert(group, { 
                  onConflict: 'instance_id,group_jid',
                  ignoreDuplicates: false 
                });
            }
          }
        } catch (err) {
          console.error(`Failed to sync groups for instance ${instance.instance_name}:`, err);
        }
      }
      
      // Refresh from database
      await fetchGroups();
    } catch (err: any) {
      console.error('Error syncing groups:', err);
      setError(err.message || 'Erro ao sincronizar grupos');
    } finally {
      setSyncing(false);
    }
  }, [userId, selectedInstanceId, fetchGroups]);

  // Initial fetch - load from DB and auto-sync from API
  useEffect(() => {
    fetchGroups().then(() => {
      // Auto-sync groups from WhatsApp API on mount
      syncGroups();
    });
  }, [fetchGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('inbox-groups-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_groups',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchGroups]);

  return {
    groups,
    loading,
    syncing,
    error,
    refetch: fetchGroups,
    syncGroups,
  };
};
