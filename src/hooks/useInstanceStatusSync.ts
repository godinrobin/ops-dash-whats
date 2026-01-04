import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Check if error message indicates a disconnected WhatsApp instance
export const isDisconnectionError = (error: string): boolean => {
  const disconnectionPatterns = [
    'disconnected',
    'desconectado',
    'not connected',
    'session closed',
    'logout',
    'qr code',
    'qrcode',
    '503',
    '401',
    'unauthorized',
    'socket closed',
    'connection lost',
    'whatsapp disconnected',
    'instance not found',
  ];
  const lowerError = error.toLowerCase();
  return disconnectionPatterns.some(pattern => lowerError.includes(pattern));
};

// Sync instance status from WhatsApp API and update database
export const syncInstanceStatus = async (
  instanceId: string
): Promise<{ disconnected: boolean; phoneNumber?: string; instanceName?: string }> => {
  try {
    // First get instance info from DB
    const { data: instance, error: instanceError } = await supabase
      .from('maturador_instances')
      .select('phone_number, instance_name, api_provider, uazapi_token')
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      console.log('[syncInstanceStatus] Instance not found:', instanceId);
      return { disconnected: false };
    }

    // Call API to check current connection status
    const { data, error } = await supabase.functions.invoke('maturador-evolution', {
      body: { action: 'get-connection-state', instanceId },
    });

    if (error) {
      console.log('[syncInstanceStatus] Error fetching status:', error);
      return { disconnected: false };
    }

    const state = data?.state || data?.status;
    const isConnected = state === 'open' || state === 'connected';

    if (!isConnected) {
      // Update instance status in DB
      await supabase
        .from('maturador_instances')
        .update({ 
          status: 'disconnected', 
          last_error_at: new Date().toISOString() 
        })
        .eq('id', instanceId);

      return {
        disconnected: true,
        phoneNumber: instance.phone_number || undefined,
        instanceName: instance.instance_name,
      };
    }

    return { disconnected: false };
  } catch (err) {
    console.error('[syncInstanceStatus] Exception:', err);
    return { disconnected: false };
  }
};

// Check and show toast if instance is disconnected
export const checkAndNotifyDisconnection = async (
  instanceId: string | null | undefined,
  context: 'maturador' | 'automatizap' | 'disparazap' = 'maturador'
): Promise<boolean> => {
  if (!instanceId) return false;

  const result = await syncInstanceStatus(instanceId);
  
  if (result.disconnected) {
    const displayName = result.phoneNumber || result.instanceName || 'Número desconhecido';
    const contextLabel = {
      maturador: 'Maturador',
      automatizap: 'AutomatiZap',
      disparazap: 'DisparaZap',
    }[context];
    
    toast.error(
      `O número ${displayName} foi desconectado. Reconecte na aba ${contextLabel}.`,
      { duration: 8000 }
    );
    return true;
  }

  return false;
};

// Hook for component usage
export const useInstanceStatusSync = () => {
  return {
    isDisconnectionError,
    syncInstanceStatus,
    checkAndNotifyDisconnection,
  };
};

export default useInstanceStatusSync;
