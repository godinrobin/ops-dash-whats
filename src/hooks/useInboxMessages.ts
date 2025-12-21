import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxMessage } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';

export const useInboxMessages = (contactId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!user || !contactId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      setMessages((data || []).map(msg => ({
        ...msg,
        direction: msg.direction as 'inbound' | 'outbound',
        message_type: msg.message_type as InboxMessage['message_type'],
        status: msg.status as InboxMessage['status']
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, contactId]);

  // Fetch messages when contactId changes
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime updates
  useEffect(() => {
    // Cleanup previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!user || !contactId) return;

    const channel = supabase
      .channel(`inbox-messages-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const newMessage = payload.new as any;
          setMessages(prev => [...prev, {
            ...newMessage,
            direction: newMessage.direction as 'inbound' | 'outbound',
            message_type: newMessage.message_type as InboxMessage['message_type'],
            status: newMessage.status as InboxMessage['status']
          }]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inbox_messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setMessages(prev => 
            prev.map(m => m.id === updated.id ? {
              ...updated,
              direction: updated.direction as 'inbound' | 'outbound',
              message_type: updated.message_type as InboxMessage['message_type'],
              status: updated.status as InboxMessage['status']
            } : m)
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, contactId]);

  const sendMessage = useCallback(async (content: string, messageType: string = 'text', mediaUrl?: string) => {
    if (!user || !contactId) return { error: 'Not authenticated or no contact selected' };

    try {
      // Get contact info for instance_id and phone
      const { data: contact } = await supabase
        .from('inbox_contacts')
        .select('instance_id, phone')
        .eq('id', contactId)
        .single();

      if (!contact) throw new Error('Contact not found');

      // Get instance name
      let instanceName = '';
      if (contact.instance_id) {
        const { data: instance } = await supabase
          .from('maturador_instances')
          .select('instance_name')
          .eq('id', contact.instance_id)
          .single();
        instanceName = instance?.instance_name || '';
      }

      // Insert message
      const { data: message, error: insertError } = await supabase
        .from('inbox_messages')
        .insert({
          contact_id: contactId,
          instance_id: contact.instance_id,
          user_id: user.id,
          direction: 'outbound',
          message_type: messageType,
          content,
          media_url: mediaUrl,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call edge function to send via Evolution API
      const { error: sendError } = await supabase.functions.invoke('send-inbox-message', {
        body: {
          contactId,
          instanceName,
          phone: contact.phone,
          content,
          messageType,
          mediaUrl,
        }
      });

      if (sendError) {
        // Update message status to failed
        await supabase
          .from('inbox_messages')
          .update({ status: 'failed' })
          .eq('id', message.id);
        throw sendError;
      }

      // Update contact's last_message_at
      await supabase
        .from('inbox_contacts')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', contactId);

      return { data: message };
    } catch (err: any) {
      return { error: err.message };
    }
  }, [user, contactId]);

  return { messages, loading, error, refetch: fetchMessages, sendMessage };
};
