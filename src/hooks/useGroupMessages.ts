import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

export interface GroupMessage {
  id: string;
  user_id: string;
  instance_id: string;
  group_jid: string;
  sender_jid: string;
  sender_name?: string;
  sender_push_name?: string;
  message_id: string;
  content?: string;
  message_type: string;
  media_url?: string;
  media_mimetype?: string;
  is_from_me: boolean;
  timestamp: string;
  created_at: string;
}

export const useGroupMessages = (groupJid: string | null, instanceId: string | null) => {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch messages from database
  const fetchMessages = useCallback(async () => {
    if (!userId || !groupJid || !instanceId) {
      setMessages([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('inbox_group_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('group_jid', groupJid)
        .eq('instance_id', instanceId)
        .order('timestamp', { ascending: true });
      
      if (fetchError) throw fetchError;
      
      setMessages((data || []) as GroupMessage[]);
    } catch (err: any) {
      console.error('Error fetching group messages:', err);
      setError(err.message || 'Erro ao buscar mensagens do grupo');
    } finally {
      setLoading(false);
    }
  }, [userId, groupJid, instanceId]);

  // Sync messages from WhatsApp API
  const syncMessages = useCallback(async () => {
    if (!userId || !groupJid || !instanceId) return;
    
    setSyncing(true);
    setError(null);
    
    try {
      const { data, error: syncError } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'fetch-group-messages',
          instanceId,
          groupJid,
          limit: 100,
        }
      });
      
      if (syncError) throw syncError;
      
      if (data?.messages && Array.isArray(data.messages)) {
        // Upsert messages to database
        const messagesToUpsert = data.messages.map((msg: any) => ({
          user_id: userId,
          instance_id: instanceId,
          group_jid: groupJid,
          sender_jid: msg.key?.participant || msg.participant || msg.senderJid || '',
          sender_name: msg.pushName || msg.senderName || null,
          sender_push_name: msg.pushName || null,
          message_id: msg.key?.id || msg.id || msg.messageId,
          content: msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   msg.body || 
                   msg.content || 
                   null,
          message_type: getMessageType(msg),
          media_url: msg.mediaUrl || msg.media_url || null,
          media_mimetype: msg.mimetype || null,
          is_from_me: msg.key?.fromMe || msg.fromMe || false,
          timestamp: msg.messageTimestamp 
            ? new Date(typeof msg.messageTimestamp === 'number' 
                ? msg.messageTimestamp * 1000 
                : msg.messageTimestamp
              ).toISOString()
            : new Date().toISOString(),
        }));

        for (const message of messagesToUpsert) {
          if (!message.message_id) continue;
          
          await supabase
            .from('inbox_group_messages')
            .upsert(message, { 
              onConflict: 'instance_id,group_jid,message_id',
              ignoreDuplicates: false 
            });
        }
        
        // Refresh from database
        await fetchMessages();
      }
    } catch (err: any) {
      console.error('Error syncing group messages:', err);
      setError(err.message || 'Erro ao sincronizar mensagens');
    } finally {
      setSyncing(false);
    }
  }, [userId, groupJid, instanceId, fetchMessages]);

  // Get message type from message object
  const getMessageType = (msg: any): string => {
    if (msg.message?.imageMessage || msg.type === 'image') return 'image';
    if (msg.message?.audioMessage || msg.type === 'audio') return 'audio';
    if (msg.message?.videoMessage || msg.type === 'video') return 'video';
    if (msg.message?.documentMessage || msg.type === 'document') return 'document';
    if (msg.message?.stickerMessage || msg.type === 'sticker') return 'sticker';
    return 'text';
  };

  // Send message to group
  const sendMessage = useCallback(async (content: string, messageType: string = 'text', mediaUrl?: string) => {
    if (!userId || !groupJid || !instanceId) {
      return { error: 'Dados insuficientes para enviar mensagem' };
    }

    try {
      const { data, error: sendError } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'send-group-message',
          instanceId,
          groupJid,
          content,
          messageType,
          mediaUrl,
        }
      });

      if (sendError) throw sendError;

      // Sync to get the sent message
      await syncMessages();

      return { data };
    } catch (err: any) {
      console.error('Error sending group message:', err);
      return { error: err.message || 'Erro ao enviar mensagem' };
    }
  }, [userId, groupJid, instanceId, syncMessages]);

  // Initial fetch when group changes - load from DB and auto-sync
  useEffect(() => {
    if (groupJid && instanceId) {
      fetchMessages().then(() => {
        // Auto-sync messages from WhatsApp API when group is selected
        syncMessages();
      });
    } else {
      setMessages([]);
    }
  }, [groupJid, instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId || !groupJid || !instanceId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channelName = `group-messages-${groupJid}-${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_group_messages',
          filter: `group_jid=eq.${groupJid}`,
        },
        (payload) => {
          const newMessage = payload.new as GroupMessage;
          if (newMessage.user_id !== userId) return;
          
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id || m.message_id === newMessage.message_id)) {
              return prev;
            }
            return [...prev, newMessage].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
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
  }, [userId, groupJid, instanceId]);

  return {
    messages,
    loading,
    syncing,
    error,
    refetch: fetchMessages,
    syncMessages,
    sendMessage,
  };
};
