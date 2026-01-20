import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ActivityStatus = 'typing' | 'recording' | null;

interface ActivityState {
  [contactId: string]: ActivityStatus;
}

/**
 * Hook to manage activity status (typing/recording) for multiple contacts.
 * Subscribes to Supabase Realtime channels for each contact.
 */
export const useContactActivityStatus = (contactIds: string[]) => {
  const [activityStates, setActivityStates] = useState<ActivityState>({});
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const channelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());

  const clearActivity = useCallback((contactId: string) => {
    setActivityStates(prev => {
      const newState = { ...prev };
      delete newState[contactId];
      return newState;
    });
  }, []);

  useEffect(() => {
    // Clean up old channels that are no longer needed
    const currentContactIds = new Set(contactIds);
    
    channelsRef.current.forEach((channel, contactId) => {
      if (!currentContactIds.has(contactId)) {
        supabase.removeChannel(channel);
        channelsRef.current.delete(contactId);
        
        // Clear timeout if exists
        const timeout = timeoutsRef.current.get(contactId);
        if (timeout) {
          clearTimeout(timeout);
          timeoutsRef.current.delete(contactId);
        }
        
        // Clear activity state
        clearActivity(contactId);
      }
    });

    // Subscribe to new contacts
    contactIds.forEach(contactId => {
      if (channelsRef.current.has(contactId)) return;

      const channel = supabase
        .channel(`typing:${contactId}`,
          {
            config: {
              // Broadcast MUST be enabled or 'on("broadcast")' may never fire
              broadcast: { self: false },
            },
          }
        )
        .on('broadcast', { event: 'typing' }, (payload) => {
          const presenceType = payload?.payload?.presenceType;

          // If backend tells us it stopped typing/recording, clear immediately
          if (presenceType === 'paused' || presenceType === 'available' || presenceType === 'none') {
            clearActivity(contactId);
            const existingTimeout = timeoutsRef.current.get(contactId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              timeoutsRef.current.delete(contactId);
            }
            return;
          }
          
          // Set status based on presence type
          const status: ActivityStatus = presenceType === 'recording' ? 'recording' : 'typing';
          
          setActivityStates(prev => ({
            ...prev,
            [contactId]: status
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
        })
        .subscribe();

      channelsRef.current.set(contactId, channel);
    });

    // Cleanup on unmount
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current.clear();
      
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
