"use client";

import { Check, Palette } from "lucide-react";
import { type ColorTheme, useTheme } from "@/components/context/themeContext";

type ThemeOption = {
  id: ColorTheme;
  name: string;
  description: string;
  page: string;
  nav: string;
  surface: string;
  accent: string;
};

const COLOR_THEMES: ThemeOption[] = [
  { id: "white", name: "White", description: "Clean and minimal", page: "#F8FAFC", nav: "#E2E8F0", surface: "#FFFFFF", accent: "#475569" },
  { id: "black", name: "Black", description: "Deep low-light", page: "#080C14", nav: "#020617", surface: "#0F172A", accent: "#CBD5E1" },
  { id: "blue", name: "Ocean Blue", description: "Professional / corporate", page: "#F8FAFC", nav: "#DBEAFE", surface: "#FFFFFF", accent: "#2563EB" },
  { id: "purple", name: "Purple", description: "Modern / creative", page: "#FAF9FF", nav: "#EDE9FE", surface: "#FFFFFF", accent: "#7C3AED" },
  { id: "emerald", name: "Emerald", description: "Clean / productivity", page: "#F0FDF4", nav: "#D1FAE5", surface: "#FFFFFF", accent: "#059669" },
  { id: "teal", name: "Teal", description: "Fresh / modern", page: "#F0FDFA", nav: "#CCFBF1", surface: "#FFFFFF", accent: "#0D9488" },
  { id: "orange", name: "Orange", description: "Energetic", page: "#FFF7ED", nav: "#FFEDD5", surface: "#FFFFFF", accent: "#EA580C" },
  { id: "red", name: "Red", description: "Urgent / action-focused", page: "#FEF2F2", nav: "#FEE2E2", surface: "#FFFFFF", accent: "#DC2626" },
  { id: "pink", name: "Pink", description: "Friendly / modern", page: "#FDF2F8", nav: "#FCE7F3", surface: "#FFFFFF", accent: "#DB2777" },
  { id: "amber", name: "Amber", description: "Warm / approachable", page: "#FFFBEB", nav: "#FEF3C7", surface: "#FFFFFF", accent: "#D97706" },
];

export default function ThemePreferences() {
  const { colorTheme, setColorTheme } = useTheme();

  return (
    <section className="appearance-gallery">
      <div className="appearance-gallery__heading">
        <span className="theme-preferences__icon"><Palette size={19} /></span>
        <div>
          <h2>Theme</h2>
          <p>Choose a colour scheme for your workspace.</p>
        </div>
      </div>

      <div className="theme-preview-grid">
        {COLOR_THEMES.map((option) => {
          const selected = colorTheme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setColorTheme(option.id)}
              aria-pressed={selected}
              className={`theme-preview ${selected ? "theme-preview--selected" : ""}`}
            >
              <span
                className="theme-preview__canvas"
                style={{ "--preview-page": option.page, "--preview-nav": option.nav, "--preview-surface": option.surface, "--preview-accent": option.accent } as React.CSSProperties}
                aria-hidden="true"
              >
                <span className="theme-preview__nav"><i /><i /><i /><i /></span>
                <span className="theme-preview__content"><i /><i /><b /><em /><em /></span>
                <span className="theme-preview__badge" />
              </span>
              <span className="theme-preview__footer">
                <span><strong>{option.name}</strong><small>{option.description}</small></span>
                {selected && <Check size={17} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
