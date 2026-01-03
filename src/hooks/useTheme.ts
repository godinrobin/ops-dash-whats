import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

const THEME_KEY = "zapdata-theme";

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") {
        return saved;
      }
    }
    return "dark"; // Default to dark
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove both classes first
    root.classList.remove("light", "dark");
    
    // Add the current theme class
    root.classList.add(theme);
    
    // Save to localStorage
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === "dark" ? "light" : "dark");
  }, []);

  return { theme, setTheme, toggleTheme };
};