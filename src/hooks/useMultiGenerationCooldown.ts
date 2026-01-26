import { useState, useEffect, useCallback } from "react";
import { useAdminStatus } from "./useAdminStatus";

const COOLDOWN_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

interface GenerationRecord {
  timestamps: number[];
}

export const useMultiGenerationCooldown = (storageKey: string, maxGenerations: number = 3) => {
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [remainingTime, setRemainingTime] = useState(0);
  const [generationsLeft, setGenerationsLeft] = useState(maxGenerations);

  const getGenerationRecord = useCallback((): GenerationRecord => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { timestamps: [] };
      }
    }
    return { timestamps: [] };
  }, [storageKey]);

  const updateCooldown = useCallback(() => {
    if (isAdmin) {
      setRemainingTime(0);
      setGenerationsLeft(maxGenerations);
      return;
    }

    const record = getGenerationRecord();
    const now = Date.now();
    
    // Filter out timestamps older than 5 minutes
    const validTimestamps = record.timestamps.filter(
      (ts) => now - ts < COOLDOWN_DURATION
    );

    // Update storage if timestamps were cleaned
    if (validTimestamps.length !== record.timestamps.length) {
      localStorage.setItem(storageKey, JSON.stringify({ timestamps: validTimestamps }));
    }

    const remaining = maxGenerations - validTimestamps.length;
    setGenerationsLeft(remaining);

    if (remaining <= 0 && validTimestamps.length > 0) {
      // Calculate time until oldest timestamp expires
      const oldestTimestamp = Math.min(...validTimestamps);
      const timeUntilExpiry = COOLDOWN_DURATION - (now - oldestTimestamp);
      setRemainingTime(Math.max(0, timeUntilExpiry));
    } else {
      setRemainingTime(0);
    }
  }, [isAdmin, getGenerationRecord, maxGenerations, storageKey]);

  useEffect(() => {
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [updateCooldown]);

  const startCooldown = useCallback(() => {
    if (!isAdmin) {
      const record = getGenerationRecord();
      const now = Date.now();
      
      // Filter valid timestamps and add new one
      const validTimestamps = record.timestamps.filter(
        (ts) => now - ts < COOLDOWN_DURATION
      );
      validTimestamps.push(now);
      
      localStorage.setItem(storageKey, JSON.stringify({ timestamps: validTimestamps }));
      
      const remaining = maxGenerations - validTimestamps.length;
      setGenerationsLeft(remaining);
      
      if (remaining <= 0) {
        const oldestTimestamp = Math.min(...validTimestamps);
        const timeUntilExpiry = COOLDOWN_DURATION - (now - oldestTimestamp);
        setRemainingTime(Math.max(0, timeUntilExpiry));
      }
    }
  }, [isAdmin, storageKey, getGenerationRecord, maxGenerations]);

  const canGenerate = isAdmin || generationsLeft > 0;

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
    generationsLeft,
    maxGenerations,
  };
};
