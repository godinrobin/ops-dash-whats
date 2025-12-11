import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useActivityTracker = (activityType: string, activityName: string) => {
  const { user } = useAuth();

  useEffect(() => {
    const trackActivity = async () => {
      if (!user) return;

      try {
        await supabase
          .from("user_activities")
          .insert({
            user_id: user.id,
            activity_type: activityType,
            activity_name: activityName,
          });
      } catch (err) {
        console.error("Error tracking activity:", err);
      }
    };

    trackActivity();
  }, [user, activityType, activityName]);
};
