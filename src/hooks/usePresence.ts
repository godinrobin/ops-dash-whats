import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const usePresence = () => {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;

    const updatePresence = async () => {
      try {
        // Use any cast since types might not be regenerated yet
        const { error } = await (supabase
          .from('user_presence' as any)
          .upsert(
            {
              user_id: user.id,
              last_seen_at: new Date().toISOString(),
              is_online: true,
            },
            { onConflict: 'user_id' }
          ) as any);

        if (error) {
          // Silently fail - presence is not critical
          console.debug("Presence update skipped:", error.message);
        }
      } catch (err) {
        // Silently fail
        console.debug("Presence error:", err);
      }
    };

    // Update immediately on mount
    updatePresence();

    // Set up heartbeat interval
    intervalRef.current = setInterval(updatePresence, HEARTBEAT_INTERVAL);

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updatePresence();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      
      // Mark as offline on unmount (best effort)
      (supabase
        .from('user_presence' as any)
        .update({ is_online: false })
        .eq('user_id', user.id) as any)
        .then(() => {});
    };
  }, [user]);
};
