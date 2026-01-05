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

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
