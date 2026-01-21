import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InboxMessage } from '@/types/inbox';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

// Simple in-memory cache for messages per contact (survives contact switching)
const messageCache = new Map<string, InboxMessage[]>();

export const useInboxMessages = (contactId: string | null) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  
  // Initialize with cached messages if available for instant display
  const [messages, setMessages] = useState<InboxMessage[]>(() => {
    if (contactId && messageCache.has(contactId)) {
      return messageCache.get(contactId) || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);

  const normalizeRemoteMessageId = (id: any): string | null => {
    if (!id) return null;
    const trimmed = String(id).trim();
    if (!trimmed) return null;
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last.length >= 8) return last;
    }
    return trimmed;
  };

  const statusRank = (status: any): number => {
    switch (String(status || '').toLowerCase()) {
      case 'read':
        return 6;
      case 'delivered':
        return 5;
      case 'sent':
        return 4;
      case 'received':
        return 3;
      case 'pending':
        return 2;
      case 'failed':
        return 1;
      default:
        return 0;
    }
  };

  const sortByCreatedAtAsc = (arr: InboxMessage[]) =>
    [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const fetchMessages = useCallback(async (showLoading = true) => {
    if (!userId || !contactId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    // Only show loading indicator on first load, not refreshes
    if (showLoading) setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Deduplicate visually by normalized remote_message_id (and keep the best status)
      const byKey = new Map<string, any>();
      const recentContentMap = new Map<string, { msg: any; timestamp: number }>();

      for (const msg of data || []) {
        const normalizedRemoteId = normalizeRemoteMessageId((msg as any).remote_message_id);
        const key = normalizedRemoteId || (msg as any).id;
        const existing = byKey.get(key);

        if (!existing) {
          byKey.set(key, msg);
        } else {
          const existingRank = statusRank((existing as any).status);
          const nextRank = statusRank((msg as any).status);
          const existingCreated = new Date((existing as any).created_at).getTime();
          const nextCreated = new Date((msg as any).created_at).getTime();

          // Keep the higher status; if tie, keep the newest created_at
          if (nextRank > existingRank || (nextRank === existingRank && nextCreated > existingCreated)) {
            byKey.set(key, msg);
          }
        }
        
        // === CONTENT-BASED DEDUPLICATION ===
        // For outbound flow messages, also dedupe by content within 60 seconds
        if (msg.direction === 'outbound' && msg.is_from_flow && msg.content) {
          const contentKey = `content:${msg.content}`;
          const msgTimestamp = new Date(msg.created_at).getTime();
          const existingContent = recentContentMap.get(contentKey);
          
          if (existingContent) {
            const timeDiff = Math.abs(msgTimestamp - existingContent.timestamp);
            // If same content within 60 seconds, keep only the first one
            if (timeDiff < 60000) {
              // Remove the duplicate from byKey (keep the earlier one)
              if (msgTimestamp > existingContent.timestamp) {
                byKey.delete(key);
              } else {
                const existingNorm = normalizeRemoteMessageId(existingContent.msg.remote_message_id);
                const existingKey = existingNorm || existingContent.msg.id;
                byKey.delete(existingKey);
                recentContentMap.set(contentKey, { msg, timestamp: msgTimestamp });
              }
              continue;
            }
          }
          recentContentMap.set(contentKey, { msg, timestamp: msgTimestamp });
        }
      }

      const next = Array.from(byKey.values()).map((msg: any) => ({
        ...msg,
        direction: msg.direction as 'inbound' | 'outbound',
        message_type: msg.message_type as InboxMessage['message_type'],
        status: msg.status as InboxMessage['status'],
      }));

      const sorted = sortByCreatedAtAsc(next);
      
      // Update cache for this contact
      if (contactId) {
        messageCache.set(contactId, sorted);
      }
      
      setMessages(sorted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, contactId]);

  // Fetch messages when contactId changes - use cache for instant display
  useEffect(() => {
    setError(null);
    
    // Try to load from cache first for instant display
    if (contactId && messageCache.has(contactId)) {
      setMessages(messageCache.get(contactId) || []);
      // Still fetch fresh data in background (no loading indicator)
      fetchMessages(false);
    } else {
      // No cache, clear and show loading
      setMessages([]);
      fetchMessages(true);
    }
  }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime updates for this contact's messages
  useEffect(() => {
    // Cleanup previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setRealtimeSubscribed(false);

    if (!userId || !contactId) return;

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
          const newRemoteNorm = normalizeRemoteMessageId(newMessage.remote_message_id);

          setMessages((prev) => {
            // Skip if same row id
            if (prev.some((m) => m.id === newMessage.id)) return prev;

            // If it matches an existing message by normalized remote id, merge visually (keep best status)
            if (newRemoteNorm) {
              const idx = prev.findIndex(
                (m) => normalizeRemoteMessageId((m as any).remote_message_id) === newRemoteNorm
              );

              if (idx !== -1) {
                const existing: any = prev[idx];
                const existingRank = statusRank(existing.status);
                const nextRank = statusRank(newMessage.status);

                const nextItem =
                  nextRank > existingRank
                    ? { ...existing, ...newMessage }
                    : { ...newMessage, ...existing };

                const merged = {
                  ...nextItem,
                  direction: nextItem.direction as 'inbound' | 'outbound',
                  message_type: nextItem.message_type as InboxMessage['message_type'],
                  status: nextItem.status as InboxMessage['status'],
                } as InboxMessage;

                const next = [...prev];
                next[idx] = merged;
                const sorted = sortByCreatedAtAsc(next);
                // Update cache
                if (contactId) messageCache.set(contactId, sorted);
                return sorted;
              }
            }

            const appended = {
              ...newMessage,
              direction: newMessage.direction as 'inbound' | 'outbound',
              message_type: newMessage.message_type as InboxMessage['message_type'],
              status: newMessage.status as InboxMessage['status'],
            } as InboxMessage;

            const sorted = sortByCreatedAtAsc([...prev, appended]);
            // Update cache
            if (contactId) messageCache.set(contactId, sorted);
            return sorted;
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
          setMessages((prev) => {
            const sorted = sortByCreatedAtAsc(
              prev.map((m) =>
                m.id === updated.id
                  ? ({
                      ...updated,
                      direction: updated.direction as 'inbound' | 'outbound',
                      message_type: updated.message_type as InboxMessage['message_type'],
                      status: updated.status as InboxMessage['status'],
                    } as InboxMessage)
                  : m
              )
            );
            // Update cache
            if (contactId) messageCache.set(contactId, sorted);
            return sorted;
          });
        }
      )
      .subscribe((status) => {
        console.log(`Realtime subscription status for ${channelName}:`, status);
        setRealtimeSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      console.log(`Cleaning up realtime channel: ${channelName}`);
      setRealtimeSubscribed(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, contactId]);

  // Fallback polling: pulls latest inbound messages from phone when realtime/webhook can't be configured
  // Otimizado: poll a cada 15s, desativa quando tab não visível
  useEffect(() => {
    // If realtime is active, don't poll (polling can cause visual duplicates/race conditions)
    if (!userId || !contactId || realtimeSubscribed) return;

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
          await fetchMessages(false); // Don't show loading on background sync
        }
      } catch (e) {
        console.warn('sync-inbox-messages exception:', e);
      } finally {
        inFlight = false;
      }
    };

    // Give realtime a chance to subscribe before starting polling
    const initialTimeout = setTimeout(tick, 4000);

    // Poll every 15 seconds
    intervalId = setInterval(tick, 15000);

    return () => {
      clearTimeout(initialTimeout);
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, contactId, fetchMessages, realtimeSubscribed]);


  const sendMessage = useCallback(async (content: string, messageType: string = 'text', mediaUrl?: string, replyToMessageId?: string) => {
    if (!userId || !contactId) return { error: 'Not authenticated or no contact selected' };

    try {
      // Fetch contact info and reply message in parallel for speed
      const [contactResult, replyResult] = await Promise.all([
        supabase
          .from('inbox_contacts')
          .select('instance_id, phone, remote_jid')
          .eq('id', contactId)
          .single(),
        replyToMessageId 
          ? supabase
              .from('inbox_messages')
              .select('remote_message_id')
              .eq('id', replyToMessageId)
              .single()
          : Promise.resolve({ data: null, error: null })
      ]);

      if (!contactResult.data) throw new Error('Contact not found');
      const contact = contactResult.data;
      
      // For @lid contacts, we need to use remote_jid for sending
      const remoteJid = (contact as any).remote_jid || null;
      const replyToRemoteId = replyResult.data?.remote_message_id || null;

      // Get instance name - this needs to be separate since we need instance_id first
      let instanceName = '';
      if (contact.instance_id) {
        const { data: instance } = await supabase
          .from('maturador_instances')
          .select('instance_name')
          .eq('id', contact.instance_id)
          .single();
        instanceName = instance?.instance_name || '';
      }

      // Insert message with pending status
      const { data: message, error: insertError } = await supabase
        .from('inbox_messages')
        .insert({
          contact_id: contactId,
          instance_id: contact.instance_id,
          user_id: userId,
          direction: 'outbound',
          message_type: messageType,
          content,
          media_url: mediaUrl,
          status: 'pending',
          reply_to_message_id: replyToMessageId || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call edge function to send via Evolution API - pass the message ID, remote_jid and reply info
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
          replyToRemoteMessageId: replyToRemoteId, // Pass the remote message ID for reply
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
  }, [userId, contactId]);

  return { messages, loading, error, refetch: fetchMessages, sendMessage };
};
