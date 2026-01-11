import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const usePushQueueProcessor = () => {
  useEffect(() => {
    // Subscribe to new notifications in the queue
    const channel = supabase
      .channel("push_notification_queue_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "push_notification_queue",
        },
        async (payload) => {
          console.log("New push notification queued:", payload);
          
          // Call the edge function to process the queue
          try {
            const { error } = await supabase.functions.invoke("process-push-queue");
            if (error) {
              console.error("Error processing push queue:", error);
            }
          } catch (err) {
            console.error("Failed to invoke push queue processor:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};
