import { useCallback, useRef, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isDisconnectionError, syncInstanceStatus } from '@/hooks/useInstanceStatusSync';

interface Conversation {
  id: string;
  name: string;
  chip_a_id: string | null;
  chip_b_id: string | null;
  is_active: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  messages_per_round: number;
  daily_limit: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  topics: string[];
}

// Global state to persist across component unmounts
const globalActiveLoops = new Set<string>();
const globalLoopTimeouts = new Map<string, NodeJS.Timeout>();
const globalSessionCounts = new Map<string, number>();
const globalConversationCache = new Map<string, Conversation>();
// Helper to fetch fresh conversation data
const fetchConversation = async (conversationId: string): Promise<Conversation | null> => {
  const { data, error } = await supabase
    .from('maturador_conversations')
    .select('*')
    .eq('id', conversationId)
    .single();
  
  if (error || !data) return null;
  
  return {
    ...data,
    topics: Array.isArray(data.topics) ? data.topics.map((t: unknown) => String(t)) : [],
  } as Conversation;
};

// Run a single iteration of the conversation loop
const runLoopIteration = async (conversationId: string) => {
  // Check if loop is still active
  if (!globalActiveLoops.has(conversationId)) {
    console.log(`Loop ${conversationId} is no longer active, stopping`);
    return;
  }

  // Fetch fresh conversation data
  const conversation = await fetchConversation(conversationId);
  if (!conversation) {
    console.error(`Conversation ${conversationId} not found`);
    stopLoop(conversationId);
    return;
  }

  // Update cache
  globalConversationCache.set(conversationId, conversation);

  try {
    const { data, error } = await supabase.functions.invoke('maturador-evolution', {
      body: { action: 'run-conversation', conversationId },
    });

    if (error) throw error;

    // Check again if loop is still active after the call
    if (!globalActiveLoops.has(conversationId)) {
      return;
    }

    if (data.error) {
      // Note: daily limit check removed from backend, but keep this for backwards compatibility
      if (data.dailyLimitReached) {
        toast.warning(`${conversation.name}: Limite diário atingido. Loop parado.`);
        stopLoop(conversationId);
        return;
      }
      
      // Check if it's a disconnection error
      if (isDisconnectionError(data.error)) {
        // Check chip_a
        if (conversation.chip_a_id) {
          const chipAResult = await syncInstanceStatus(conversation.chip_a_id);
          if (chipAResult.disconnected) {
            toast.error(`Número ${chipAResult.phoneNumber || chipAResult.instanceName || 'desconhecido'} foi desconectado. Reconecte na aba Maturador.`, {
              duration: 8000,
            });
            stopLoop(conversationId);
            return;
          }
        }
        
        // Check chip_b
        if (conversation.chip_b_id) {
          const chipBResult = await syncInstanceStatus(conversation.chip_b_id);
          if (chipBResult.disconnected) {
            toast.error(`Número ${chipBResult.phoneNumber || chipBResult.instanceName || 'desconhecido'} foi desconectado. Reconecte na aba Maturador.`, {
              duration: 8000,
            });
            stopLoop(conversationId);
            return;
          }
        }
      }
      
      throw new Error(data.error);
    }

    if ((data?.messagesSent || 0) > 0) {
      // Update session count
      const currentCount = globalSessionCounts.get(conversationId) || 0;
      globalSessionCounts.set(conversationId, currentCount + 1);
    }

    // Check again before scheduling next
    if (!globalActiveLoops.has(conversationId)) {
      return;
    }

    // Calculate random delay for next message
    const delay = Math.floor(
      Math.random() * (conversation.max_delay_seconds - conversation.min_delay_seconds + 1)
    ) + conversation.min_delay_seconds;

    console.log(`[Maturador Global] Next message for "${conversation.name}" in ${delay} seconds`);

    // Schedule next execution
    const timeout = setTimeout(() => {
      runLoopIteration(conversationId);
    }, delay * 1000);

    globalLoopTimeouts.set(conversationId, timeout);

  } catch (error: unknown) {
    console.error('Loop error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar mensagem';
    
    // Check for disconnection on general errors too
    if (isDisconnectionError(errorMessage)) {
      if (conversation.chip_a_id) {
        const result = await syncInstanceStatus(conversation.chip_a_id);
        if (result.disconnected) {
          toast.error(`Número ${result.phoneNumber || result.instanceName || 'desconhecido'} foi desconectado. Reconecte na aba Maturador.`, {
            duration: 8000,
          });
          stopLoop(conversationId);
          return;
        }
      }
    }
    
    toast.error(`${conversation.name}: ${errorMessage}`);
    stopLoop(conversationId);
  }
};

// Start a loop for a conversation
export const startLoop = (conversation: Conversation) => {
  if (!conversation.is_active) {
    toast.error('Ative a conversa antes de executar');
    return;
  }

  // Store in global state
  globalActiveLoops.add(conversation.id);
  globalConversationCache.set(conversation.id, conversation);
  globalSessionCounts.set(conversation.id, 0);

  toast.success(`Loop iniciado: ${conversation.name}`);
  console.log(`[Maturador Global] Starting loop for ${conversation.name}`);

  // Start immediately
  runLoopIteration(conversation.id);
};

// Stop a loop for a conversation
export const stopLoop = (conversationId: string) => {
  // Remove from active loops
  globalActiveLoops.delete(conversationId);

  // Clear pending timeout
  const timeout = globalLoopTimeouts.get(conversationId);
  if (timeout) {
    clearTimeout(timeout);
    globalLoopTimeouts.delete(conversationId);
  }

  const conversation = globalConversationCache.get(conversationId);
  const messagesInSession = globalSessionCounts.get(conversationId) || 0;
  
  console.log(`[Maturador Global] Stopped loop for ${conversation?.name || conversationId}`);
  toast.info(`Loop parado: ${conversation?.name || 'Conversa'}. ${messagesInSession} mensagens enviadas nesta sessão.`);
  
  // Clean up
  globalSessionCounts.delete(conversationId);
  globalConversationCache.delete(conversationId);
};

// Check if a loop is active
export const isLoopActive = (conversationId: string): boolean => {
  return globalActiveLoops.has(conversationId);
};

// Get session message count
export const getSessionCount = (conversationId: string): number => {
  return globalSessionCounts.get(conversationId) || 0;
};

// Hook to sync component state with global state
export const useMaturadorLoop = () => {
  const [activeLoops, setActiveLoops] = useState<Set<string>>(new Set(globalActiveLoops));
  const [sessionMessageCounts, setSessionMessageCounts] = useState<Map<string, number>>(
    new Map(globalSessionCounts)
  );

  // Update local state periodically to sync with global state
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLoops(new Set(globalActiveLoops));
      setSessionMessageCounts(new Map(globalSessionCounts));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const startConversationLoop = useCallback((conversation: Conversation) => {
    startLoop(conversation);
    setActiveLoops(new Set(globalActiveLoops));
  }, []);

  const stopConversationLoop = useCallback((conversationId: string) => {
    stopLoop(conversationId);
    setActiveLoops(new Set(globalActiveLoops));
  }, []);

  return {
    activeLoops,
    sessionMessageCounts,
    startConversationLoop,
    stopConversationLoop,
    isLoopActive,
    getSessionCount,
  };
};
