import { supabase } from "@/integrations/supabase/client";

let initPromise: Promise<void> | null = null;

const isStandalonePwa = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  // iOS legacy
  (window.navigator as any).standalone === true;

export function getOneSignal(): any | null {
  return (window as any).__ONESIGNAL_INSTANCE__ || null;
}

export async function ensureOneSignalInitialized() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Ensure SDK queue exists
    (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];

    const { data, error } = await supabase.functions.invoke("onesignal-config");
    if (error) throw error;

    const appId = (data as any)?.appId as string | undefined;
    if (!appId) throw new Error("OneSignal appId missing");

    await new Promise<void>((resolve, reject) => {
      (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          if ((window as any).__ONESIGNAL_INSTANCE__) {
            resolve();
            return;
          }

          await OneSignal.init({
            appId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
            welcomeNotification: { disable: true },
            // Ensure SW is found at root
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/" },
            // We control prompting from UI (button click)
            promptOptions: {
              slidedown: {
                prompts: [{ type: "push", autoPrompt: false }],
              },
            },
          });

          (window as any).__ONESIGNAL_INSTANCE__ = OneSignal;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  })();

  return initPromise;
}

export function getIosPushRequirementMessage() {
  if (!/iphone|ipad|ipod/i.test(navigator.userAgent)) return null;
  if (!isStandalonePwa()) {
    return "No iPhone, as notificações só funcionam se você adicionar o web app na tela inicial e abrir por lá.";
  }
  return null;
}
