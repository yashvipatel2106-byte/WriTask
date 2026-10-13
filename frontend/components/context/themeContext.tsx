"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";
type ThemeCtx = { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void };

const ThemeContext = createContext<ThemeCtx | undefined>(undefined);

/**
 * Runs before React hydrates to set the .dark class from the saved choice
 * (or OS preference), preventing a flash of the wrong theme.
 */
export const themeInitScript = `
(function(){try{
  var t = localStorage.getItem('theme');
  if(!t){ t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.style.colorScheme = t;
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // sync state from what the init script already applied
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setThemeState(isDark ? "dark" : "light");
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
    try { localStorage.setItem("theme", t); } catch {}
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    apply(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: apply }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}