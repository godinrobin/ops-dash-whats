import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppGroup } from '@/types/groups';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

export const useWhatsAppGroups = (instanceId?: string) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Get instances for the user
      let instanceQuery = supabase
        .from('maturador_instances')
        .select('id, instance_name, api_provider, uazapi_token')
        .eq('user_id', userId)
        .in('status', ['connected', 'open']);
      
      if (instanceId) {
        instanceQuery = instanceQuery.eq('id', instanceId);
      }
      
      const { data: instances, error: instanceError } = await instanceQuery;
      
      if (instanceError) throw instanceError;
      if (!instances || instances.length === 0) {
        setGroups([]);
        return;
      }

      // Fetch groups from all instances
      const allGroups: WhatsAppGroup[] = [];
      
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
            const mappedGroups = data.groups.map((g: any) => ({
              id: g.id || g.jid,
              name: g.subject || g.name || 'Grupo sem nome',
              description: g.desc || g.description,
              profile_pic_url: g.profilePictureUrl || g.pictureUrl || null,
              owner: g.owner || '',
              creation: g.creation || 0,
              participant_count: g.size || g.participants?.length || 0,
              instance_id: instance.id,
              jid: g.id || g.jid,
            }));
            allGroups.push(...mappedGroups);
          }
        } catch (err) {
          console.error(`Failed to fetch groups for instance ${instance.instance_name}:`, err);
        }
      }
      
      setGroups(allGroups);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      setError(err.message || 'Erro ao buscar grupos');
    } finally {
      setLoading(false);
    }
  }, [userId, instanceId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return {
    groups,
    loading,
    error,
    refetch: fetchGroups,
  };
};
