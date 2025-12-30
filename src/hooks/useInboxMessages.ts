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
      
      // Show ALL messages - don't filter empty ones (they may be placeholders for unsupported formats)
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

  // Subscribe to realtime updates for this contact's messages
  useEffect(() => {
    // Cleanup previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!user || !contactId) return;

    const channelName = `inbox-messages-${contactId}-${Date.now()}`;
    console.log(`Subscribing to realtime channel: ${channelName}`);
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          console.log('Realtime INSERT received:', payload);
          const newMessage = payload.new as any;
          
          // Check if message already exists to avoid duplicates
          setMessages(prev => {
            const exists = prev.some(m => m.id === newMessage.id);
            if (exists) {
              console.log('Message already exists, skipping duplicate');
              return prev;
            }
            
            return [...prev, {
              ...newMessage,
              direction: newMessage.direction as 'inbound' | 'outbound',
              message_type: newMessage.message_type as InboxMessage['message_type'],
              status: newMessage.status as InboxMessage['status']
            }];
          });
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
          console.log('Realtime UPDATE received:', payload);
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
      .subscribe((status) => {
        console.log(`Realtime subscription status for ${channelName}:`, status);
      });

    channelRef.current = channel;

    return () => {
      console.log(`Cleaning up realtime channel: ${channelName}`);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, contactId]);

  // Fallback polling: pulls latest inbound messages from Evolution when webhook can't be configured
  // Otimizado: poll a cada 15s, desativa quando tab não visível
  useEffect(() => {
    if (!user || !contactId) return;

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let configMissing = false;
    let isTabVisible = true;

    const stopPolling = () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };

    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const tick = async () => {
      // Não faz polling se tab não está visível ou já está em andamento
      if (cancelled || inFlight || configMissing || !isTabVisible) return;
      inFlight = true;
      try {
        const { data, error: syncError } = await supabase.functions.invoke('sync-inbox-messages', {
          body: { contactId },
        });

        if (syncError) {
          const errorBody = (syncError as any)?.context?.body;
          const errorStr = typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody || '');

          if (errorStr.includes('Contact not found')) {
            setError('Contact not found');
            stopPolling();
            return;
          }

          if (errorStr.includes('Evolution API not configured')) {
            console.info('Evolution API not configured - message sync disabled');
            configMissing = true;
            return;
          }

          console.warn('sync-inbox-messages error:', syncError);
          return;
        }

        const inserted = (data as any)?.inserted ?? 0;
        if (inserted > 0) {
          console.log(`Synced ${inserted} new messages from phone`);
          await fetchMessages();
        }
      } catch (e) {
        console.warn('sync-inbox-messages exception:', e);
      } finally {
        inFlight = false;
      }
    };

    // Trigger initial sync after 1s delay
    const initialTimeout = setTimeout(tick, 1000);
    
    // Poll every 15 seconds (otimizado de 5s para 15s)
    intervalId = setInterval(tick, 15000);

    return () => {
      clearTimeout(initialTimeout);
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, contactId, fetchMessages]);


  const sendMessage = useCallback(async (content: string, messageType: string = 'text', mediaUrl?: string) => {
    if (!user || !contactId) return { error: 'Not authenticated or no contact selected' };

    try {
      // Get contact info for instance_id, phone, and remote_jid
      const { data: contact } = await supabase
        .from('inbox_contacts')
        .select('instance_id, phone, remote_jid')
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
      
      // For @lid contacts, we need to use remote_jid for sending
      const remoteJid = (contact as any).remote_jid || null;

      // Insert message with pending status
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

      // Call edge function to send via Evolution API - pass the message ID and remote_jid
      const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-inbox-message', {
        body: {
          contactId,
          instanceName,
          phone: contact.phone,
          remoteJid, // Include remote_jid for @lid contacts
          content,
          messageType,
          mediaUrl,
          messageId: message.id, // Pass the message ID so the edge function can update it
        }
      });

      if (sendError) {
        console.error('Error sending message:', sendError);
        // Update message status to failed
        await supabase
          .from('inbox_messages')
          .update({ status: 'failed' })
          .eq('id', message.id);
        
        // Parse the error for user-friendly message and error code
        let errorMsg = 'Erro ao enviar mensagem';
        let errorCode = 'SEND_FAILED';
        try {
          const errorBody = (sendError as any)?.context?.body;
          if (typeof errorBody === 'string') {
            const parsed = JSON.parse(errorBody);
            errorMsg = parsed.error || errorMsg;
            errorCode = parsed.errorCode || errorCode;
          } else if (errorBody?.error) {
            errorMsg = errorBody.error;
            errorCode = errorBody.errorCode || errorCode;
          }
        } catch {
          // Keep default error message
        }
        
        // Return error with code instead of throwing
        return { error: errorMsg, errorCode };
      }

      // Update contact's last_message_at
      await supabase
        .from('inbox_contacts')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', contactId);

      return { data: message };
    } catch (err: any) {
      console.error('sendMessage error:', err);
      return { error: err.message, errorCode: 'UNKNOWN_ERROR' };
    }
  }, [user, contactId]);

  return { messages, loading, error, refetch: fetchMessages, sendMessage };
};
