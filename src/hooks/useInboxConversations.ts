import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxContact } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

export const useInboxConversations = (instanceId?: string) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedInstanceIds, setConnectedInstanceIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch connected instances
  const fetchConnectedInstances = useCallback(async () => {
    if (!userId) return;

    try {
      // Some deployments use status="connected" instead of "open"
      const { data } = await supabase
        .from('maturador_instances')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['open', 'connected']);

      if (data) {
        setConnectedInstanceIds(new Set(data.map((i) => i.id)));
      }
    } catch (err) {
      console.error('Error fetching connected instances:', err);
    }
  }, [userId]);

  useEffect(() => {
    fetchConnectedInstances();
  }, [fetchConnectedInstances]);

  // Subscribe to instance status changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('instance-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'maturador_instances',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchConnectedInstances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConnectedInstances]);

  const fetchContacts = useCallback(async () => {
    if (!userId) return;

    try {
      let query = supabase
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(10000); // Remove 1000 default limit

      if (instanceId) {
        query = query.eq('instance_id', instanceId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Show all contacts - don't filter by instance connection status
      // This ensures users can always see their conversations
      const filteredData = data || [];

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
  }, [userId, instanceId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Subscribe to contact changes with proper cleanup
  useEffect(() => {
    // Cleanup previous channels
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (messagesChannelRef.current) {
      supabase.removeChannel(messagesChannelRef.current);
      messagesChannelRef.current = null;
    }

    if (!userId) return;

    const channelName = `inbox-contacts-changes-${userId}-${Date.now()}`;
    console.log(`[useInboxConversations] Subscribing to contacts channel: ${channelName}`);
    
    const contactsChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[useInboxConversations] Realtime INSERT received:', payload);
          const newContact = payload.new as any;
          
          // Check if we should include this contact based on instanceId filter
          if (instanceId && newContact.instance_id !== instanceId) {
            console.log('[useInboxConversations] Ignoring INSERT - different instance');
            return;
          }
          
          setContacts(prev => {
            // Check if already exists
            if (prev.some(c => c.id === newContact.id)) {
              console.log('[useInboxConversations] Contact already exists, skipping');
              return prev;
            }
            
            const formattedContact = {
              ...newContact,
              tags: Array.isArray(newContact.tags) ? (newContact.tags as any[]).map((t: any) => String(t)) : [],
              status: newContact.status as 'active' | 'archived'
            } as InboxContact;
            
            console.log('[useInboxConversations] Adding new contact to list:', formattedContact.id);
            return [formattedContact, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inbox_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setContacts(prev => {
            const existingContact = prev.find(c => c.id === updated.id);
            
            // Guard: Only reorder if last_message_at or unread_count actually changed
            const lastMessageChanged = existingContact?.last_message_at !== updated.last_message_at;
            const unreadChanged = existingContact?.unread_count !== updated.unread_count;
            
            const newList = prev.map(c => c.id === updated.id ? {
              ...updated,
              tags: Array.isArray(updated.tags) ? (updated.tags as any[]).map((t: any) => String(t)) : [],
              status: updated.status as 'active' | 'archived'
            } as InboxContact : c);
            
            // Only re-sort if there was a meaningful change that affects ordering
            if (lastMessageChanged || unreadChanged) {
              return newList.sort((a, b) => 
                new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              );
            }
            
            return newList;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'inbox_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setContacts(prev => prev.filter(c => c.id !== payload.old.id));
        }
      )
      .subscribe((status) => {
        console.log(`[useInboxConversations] Contacts channel status: ${status}`);
      });

    channelRef.current = contactsChannel;

    // Subscribe to new messages to update contact's last_message_at and move to top
    const messagesChannelName = `inbox-messages-for-contacts-${userId}-${Date.now()}`;
    const messagesChannel = supabase
      .channel(messagesChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          // Update the contact's last_message_at and re-sort
          setContacts(prev => {
            // Check if contact exists in list
            const contactExists = prev.some(c => c.id === newMessage.contact_id);
            
            if (!contactExists) {
              // Contact not in list yet - trigger a refetch to get it
              console.log('[useInboxConversations] Message for unknown contact, refetching...');
              fetchContacts();
              return prev;
            }
            
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
      .subscribe((status) => {
        console.log(`[useInboxConversations] Messages channel status: ${status}`);
      });

    messagesChannelRef.current = messagesChannel;

    return () => {
      console.log('[useInboxConversations] Cleaning up channels');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (messagesChannelRef.current) {
        supabase.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
    };
  }, [userId, instanceId, fetchContacts]);

  // Fallback polling: refresh contacts periodically to catch any missed realtime events
  useEffect(() => {
    if (!userId) return;
    
    let isTabVisible = true;
    
    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
      // Refetch when tab becomes visible again
      if (isTabVisible) {
        console.log('[useInboxConversations] Tab became visible, refetching contacts');
        fetchContacts();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Poll every 10 seconds as fallback for realtime issues
    const intervalId = setInterval(() => {
      if (isTabVisible) {
        fetchContacts();
      }
    }, 10000);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [userId, fetchContacts]);

  return { contacts, loading, error, refetch: fetchContacts };
};
