import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxContact } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';

export const useInboxConversations = (instanceId?: string) => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedInstanceIds, setConnectedInstanceIds] = useState<Set<string>>(new Set());

  // Fetch connected instances
  const fetchConnectedInstances = useCallback(async () => {
    if (!user) return;

    try {
      // Some deployments use status="connected" instead of "open"
      const { data } = await supabase
        .from('maturador_instances')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['open', 'connected']);

      if (data) {
        setConnectedInstanceIds(new Set(data.map((i) => i.id)));
      }
    } catch (err) {
      console.error('Error fetching connected instances:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchConnectedInstances();
  }, [fetchConnectedInstances]);

  // Subscribe to instance status changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('instance-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'maturador_instances',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchConnectedInstances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConnectedInstances]);

  const fetchContacts = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (instanceId) {
        query = query.eq('instance_id', instanceId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Filter contacts to only show those from connected instances
      const filteredData = (data || []).filter((contact) => {
        // If no instance_id, hide the contact (orphaned)
        if (!contact.instance_id) return false;
        // Only show contacts from connected instances
        return connectedInstanceIds.size === 0 || connectedInstanceIds.has(contact.instance_id);
      });

      setContacts(
        filteredData.map((contact) => ({
          ...contact,
          tags: Array.isArray(contact.tags) ? (contact.tags as any[]).map((t) => String(t)) : [],
          status: contact.status as 'active' | 'archived',
        })) as InboxContact[]
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, instanceId, connectedInstanceIds]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Subscribe to contact changes
  useEffect(() => {
    if (!user) return;

    const contactsChannel = supabase
      .channel('inbox-contacts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_contacts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newContact = payload.new as any;
            setContacts(prev => [{
              ...newContact,
              tags: Array.isArray(newContact.tags) ? (newContact.tags as any[]).map((t: any) => String(t)) : [],
              status: newContact.status as 'active' | 'archived'
            } as InboxContact, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            setContacts(prev => {
              const newList = prev.map(c => c.id === updated.id ? {
                ...updated,
                tags: Array.isArray(updated.tags) ? (updated.tags as any[]).map((t: any) => String(t)) : [],
                status: updated.status as 'active' | 'archived'
              } as InboxContact : c);
              // Re-sort by last_message_at
              return newList.sort((a, b) => 
                new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              );
            });
          } else if (payload.eventType === 'DELETE') {
            setContacts(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to new messages to update contact's last_message_at and move to top
    const messagesChannel = supabase
      .channel('inbox-messages-for-contacts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          // Update the contact's last_message_at and re-sort
          setContacts(prev => {
            const newList = prev.map(c => {
              if (c.id === newMessage.contact_id) {
                return {
                  ...c,
                  last_message_at: newMessage.created_at,
                  unread_count: newMessage.direction === 'inbound' ? (c.unread_count || 0) + 1 : c.unread_count
                };
              }
              return c;
            });
            // Re-sort by last_message_at
            return newList.sort((a, b) => 
              new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user]);

  return { contacts, loading, error, refetch: fetchContacts };
};
