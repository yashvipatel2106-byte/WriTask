"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/validation/api";

export type ColorTheme =
  | "white"
  | "black"
  | "blue"
  | "purple"
  | "emerald"
  | "teal"
  | "orange"
  | "red"
  | "pink"
  | "amber";

type ThemeCtx = {
  colorTheme: ColorTheme;
  setColorTheme: (t: ColorTheme) => void;
};

const ThemeContext = createContext<ThemeCtx | undefined>(undefined);

const COLOR_THEMES: ColorTheme[] = [
  "white",
  "black",
  "blue",
  "purple",
  "emerald",
  "teal",
  "orange",
  "red",
  "pink",
  "amber",
];

/** Maps legacy palette ids to the current appearance set. */
const THEME_ALIASES: Record<string, ColorTheme> = {
  coral: "red",
  softRed: "red",
  lavender: "purple",
  mint: "emerald",
  yellow: "amber",
  navy: "blue",
  azure: "teal",
};

function resolveColorTheme(value: string | undefined | null): ColorTheme | null {
  if (!value) return null;
  if (THEME_ALIASES[value]) return THEME_ALIASES[value];
  return COLOR_THEMES.includes(value as ColorTheme) ? (value as ColorTheme) : null;
}

/**
 * Runs before React hydrates. The stored session belongs to the signed-in
 * user, so two people using the same browser still get their own palette.
 */
export const themeInitScript = `
(function(){try{
  var u = JSON.parse(localStorage.getItem('user') || '{}');
  var c = u.colorTheme;
  var aliases = {coral:'red',softRed:'red',lavender:'purple',mint:'emerald',yellow:'amber',navy:'blue',azure:'teal'};
  if(aliases[c]){ c = aliases[c]; }
  if(!c){ c = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white'; }
  if(['white','black','blue','purple','emerald','teal','orange','red','pink','amber'].indexOf(c) === -1){ c = 'white'; }
  document.documentElement.classList.toggle('dark', c === 'black');
  document.documentElement.dataset.colorTheme = c;
  document.documentElement.style.colorScheme = c === 'black' ? 'dark' : 'light';
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>("white");

  const apply = useCallback((nextColorTheme: ColorTheme) => {
    document.documentElement.dataset.colorTheme = nextColorTheme;
    document.documentElement.classList.toggle("dark", nextColorTheme === "black");
    document.documentElement.style.colorScheme = nextColorTheme === "black" ? "dark" : "light";
    setColorThemeState(nextColorTheme);
  }, []);

  const updateStoredUserTheme = useCallback((nextColorTheme: ColorTheme | null) => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, colorTheme: nextColorTheme }));
    } catch {
      // A malformed cache is not allowed to prevent the visual preference.
    }
  }, []);

  // sync state from what the init script already applied
  useEffect(() => {
    const storedColorTheme = document.documentElement.dataset.colorTheme;
    setColorThemeState(resolveColorTheme(storedColorTheme) ?? "white");
  }, []);

  // Fetch the account-owned preference on existing sessions. Login already
  // puts it in localStorage, so this mainly covers sessions created before
  // the setting was introduced or another device changing the preference.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    void fetch(apiUrl("/profile"), { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((profile) => {
        const saved = resolveColorTheme(profile?.settings?.colorTheme);
        if (saved) {
          apply(saved);
          updateStoredUserTheme(saved);
        }
      })
      .catch(() => {});
  }, [apply, updateStoredUserTheme]);

  const setColorTheme = useCallback(
    (nextColorTheme: ColorTheme) => {
      apply(nextColorTheme);
      updateStoredUserTheme(nextColorTheme);

      const token = localStorage.getItem("token");
      if (!token) return;

      void fetch(apiUrl("/profile/appearance"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ colorTheme: nextColorTheme }),
      }).catch(() => {});
    },
    [apply, updateStoredUserTheme]
  );

  return (
    <ThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
