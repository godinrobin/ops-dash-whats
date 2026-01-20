import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ActivityStatus = 'typing' | 'recording' | null;

interface ActivityState {
  [contactId: string]: ActivityStatus;
}

/**
 * Hook to manage activity status (typing/recording) for multiple contacts.
 * Subscribes to Supabase Realtime postgres_changes on inbox_contact_activity table.
 */
export const useContactActivityStatus = (contactIds: string[]) => {
  const [activityStates, setActivityStates] = useState<ActivityState>({});
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const clearActivity = useCallback((contactId: string) => {
    setActivityStates(prev => {
      const newState = { ...prev };
      delete newState[contactId];
      return newState;
    });
  }, []);

  useEffect(() => {
    if (contactIds.length === 0) return;

    // Subscribe to postgres_changes on inbox_contact_activity table
    const channel = supabase
      .channel('inbox_contact_activity_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'inbox_contact_activity',
        },
        (payload) => {
          const { new: newRow, old: oldRow, eventType } = payload;
          
          // Get the contact_id from the payload
          const contactId = (newRow as any)?.contact_id || (oldRow as any)?.contact_id;
          
          // Only process if this contact is in our list
          if (!contactId || !contactIds.includes(contactId)) return;
          
          const status = (newRow as any)?.status as string | null;
          
          if (eventType === 'DELETE' || !status) {
            // Clear activity
            clearActivity(contactId);
            const existingTimeout = timeoutsRef.current.get(contactId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              timeoutsRef.current.delete(contactId);
            }
            return;
          }
          
          // Set status based on value
          const activityStatus: ActivityStatus = status === 'recording' ? 'recording' : 'typing';
          
          setActivityStates(prev => ({
            ...prev,
            [contactId]: activityStatus
          }));
          
          // Clear any existing timeout for this contact
          const existingTimeout = timeoutsRef.current.get(contactId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          
          // Auto-hide after 5 seconds
          const timeout = setTimeout(() => {
            clearActivity(contactId);
            timeoutsRef.current.delete(contactId);
          }, 5000);
          
          timeoutsRef.current.set(contactId, timeout);
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[useContactActivityStatus] Subscription error:', err);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      timeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      timeoutsRef.current.clear();
    };
  }, [contactIds, clearActivity]);

  const getActivityStatus = useCallback((contactId: string): ActivityStatus => {
    return activityStates[contactId] || null;
  }, [activityStates]);

  return { getActivityStatus, activityStates };
};
