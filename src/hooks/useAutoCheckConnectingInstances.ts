import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type PollableInstance = {
  instance_name: string;
  status: string;
};

type Options = {
  enabled?: boolean;
  intervalMs?: number;
};

/**
 * While there are instances in "connecting", periodically asks the backend to re-check status.
 * The backend updates the database; after polling we call `refresh` to reflect updated status in the UI.
 */
export function useAutoCheckConnectingInstances(
  instances: PollableInstance[],
  refresh: () => void | Promise<void>,
  options: Options = {}
) {
  const { enabled = true, intervalMs = 4000 } = options;

  const connectingNamesKey = useMemo(() => {
    const names = instances
      .filter((i) => i.status === "connecting")
      .map((i) => i.instance_name)
      .sort();
    return names.join("|");
  }, [instances]);

  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!connectingNamesKey) return;

    const connectingNames = connectingNamesKey.split("|").filter(Boolean);
    let cancelled = false;

    const pollOnce = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await Promise.allSettled(
          connectingNames.map((instanceName) =>
            supabase.functions.invoke("maturador-evolution", {
              body: { action: "check-status", instanceName },
            })
          )
        );

        if (!cancelled) {
          await Promise.resolve(refresh());
        }
      } finally {
        runningRef.current = false;
      }
    };

    // First check shortly after opening the screen (gives time for the API to finalize the connection)
    const initial = setTimeout(() => void pollOnce(), 1200);
    const interval = setInterval(() => void pollOnce(), intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [enabled, connectingNamesKey, intervalMs, refresh]);
}
