import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize theme from localStorage or default to dark
const initializeTheme = () => {
  const savedTheme = localStorage.getItem("zapdata-theme");
  const theme = savedTheme === "light" ? "light" : "dark";
  document.documentElement.classList.add(theme);
};

// Initialize OneSignal from environment variable (Web SDK v16)
const initializeOneSignal = () => {
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (!appId) return;

  (window as any).__ONESIGNAL_APP_ID__ = appId;
  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];

  // Prevent double init (StrictMode can mount twice)
  if ((window as any).__ONESIGNAL_INITIALIZED__) return;
  (window as any).__ONESIGNAL_INITIALIZED__ = true;

  (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      await OneSignal.init({
        appId,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
        // Match OneSignal permission prompt configuration style
        promptOptions: {
          slidedown: {
            prompts: [{ type: "push", autoPrompt: false }],
          },
        },
      });
      console.log("[OneSignal] Initialized");
    } catch (e) {
      console.warn("[OneSignal] Init failed", e);
      (window as any).__ONESIGNAL_INITIALIZED__ = false;
    }
  });
};

initializeTheme();
initializeOneSignal();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
