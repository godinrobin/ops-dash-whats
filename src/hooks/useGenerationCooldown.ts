import { useState, useEffect, useCallback } from "react";
import { useAdminStatus } from "./useAdminStatus";

const COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export const useGenerationCooldown = (storageKey: string) => {
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [remainingTime, setRemainingTime] = useState(0);

  const getLastGeneration = useCallback(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : 0;
  }, [storageKey]);

  const updateCooldown = useCallback(() => {
    if (isAdmin) {
      setRemainingTime(0);
      return;
    }

    const lastGeneration = getLastGeneration();
    if (lastGeneration) {
      const elapsed = Date.now() - lastGeneration;
      const remaining = Math.max(0, COOLDOWN_DURATION - elapsed);
      setRemainingTime(remaining);
    } else {
      setRemainingTime(0);
    }
  }, [isAdmin, getLastGeneration]);

  useEffect(() => {
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [updateCooldown]);

  const startCooldown = useCallback(() => {
    if (!isAdmin) {
      localStorage.setItem(storageKey, Date.now().toString());
      setRemainingTime(COOLDOWN_DURATION);
    }
  }, [isAdmin, storageKey]);

  const canGenerate = isAdmin || remainingTime === 0;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return {
    canGenerate,
    remainingTime,
    formattedTime: formatTime(remainingTime),
    startCooldown,
    isAdmin,
    adminLoading,
  };
};
