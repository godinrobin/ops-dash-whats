import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useActivityTracker = (activityType: string, activityName: string) => {
  const { user } = useAuth();
  const hasTracked = useRef(false);

  useEffect(() => {
    const trackActivity = async () => {
      // Prevent duplicate tracking on re-renders
      if (!user || hasTracked.current) return;
      hasTracked.current = true;

      const { error } = await supabase
        .from("user_activities")
        .insert({
          user_id: user.id,
          activity_type: activityType,
          activity_name: activityName,
        });

      if (error) {
        console.error("Error tracking activity:", error.message, error.details);
      }
    };

    trackActivity();
  }, [user, activityType, activityName]);
};
