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

// Initialize OneSignal App ID from environment variable
const initializeOneSignal = () => {
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  if (appId) {
    (window as any).__ONESIGNAL_APP_ID__ = appId;
    console.log("[OneSignal] App ID configured");
  }
};

initializeTheme();
initializeOneSignal();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
