import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DAILY_PROMPT_LIMIT = 30;

export const useDeliverablePromptLimit = (userId: string | undefined) => {
  const [promptsUsed, setPromptsUsed] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_deliverable_prompt_usage", {
        p_user_id: userId,
      });

      if (error) {
        console.error("Error fetching prompt usage:", error);
        return;
      }

      const usage = data || 0;
      setPromptsUsed(usage);
      setHasReachedLimit(usage >= DAILY_PROMPT_LIMIT);
    } catch (err) {
      console.error("Error fetching prompt usage:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const incrementPrompt = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    // Check if already at limit before incrementing
    if (promptsUsed >= DAILY_PROMPT_LIMIT) {
      setHasReachedLimit(true);
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("increment_deliverable_prompt", {
        p_user_id: userId,
      });

      if (error) {
        console.error("Error incrementing prompt:", error);
        return false;
      }

      const newCount = data || 0;
      setPromptsUsed(newCount);
      
      if (newCount >= DAILY_PROMPT_LIMIT) {
        setHasReachedLimit(true);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Error incrementing prompt:", err);
      return false;
    }
  }, [userId, promptsUsed]);

  const remainingPrompts = Math.max(0, DAILY_PROMPT_LIMIT - promptsUsed);

  return {
    promptsUsed,
    remainingPrompts,
    dailyLimit: DAILY_PROMPT_LIMIT,
    hasReachedLimit,
    isLoading,
    incrementPrompt,
    refetch: fetchUsage,
  };
};
