import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxContact } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';

export const useInboxConversations = (instanceId?: string) => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = async () => {
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
      
      setContacts((data || []).map(contact => ({
        ...contact,
        tags: Array.isArray(contact.tags) ? (contact.tags as any[]).map(t => String(t)) : [],
        status: contact.status as 'active' | 'archived'
      })) as InboxContact[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [user, instanceId]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
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
            setContacts(prev => 
              prev.map(c => c.id === updated.id ? {
                ...updated,
                tags: Array.isArray(updated.tags) ? (updated.tags as any[]).map((t: any) => String(t)) : [],
                status: updated.status as 'active' | 'archived'
              } as InboxContact : c)
                .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime())
            );
          } else if (payload.eventType === 'DELETE') {
            setContacts(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { contacts, loading, error, refetch: fetchContacts };
};
