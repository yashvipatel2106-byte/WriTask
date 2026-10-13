"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Extra classes on the outer (relative, inline-flex) wrapper. */
  className?: string;
  /**
   * Replaces the default trigger look entirely — use for compact/borderless
   * contexts. Pass a function of `open` to keep open/closed visual feedback
   * (focus ring, chevron color, etc.) on a custom style; a plain string is
   * static regardless of open state.
   */
  triggerClassName?: string | ((open: boolean) => string);
  /** Width/sizing classes for the floating menu (it's position:fixed, so plain widths apply as-is). */
  menuClassName?: string;
  /** Anchor the menu to the trigger's left or right edge. */
  align?: "left" | "right";
};

const DEFAULT_TRIGGER =
  "flex items-center justify-between gap-2 w-full whitespace-nowrap bg-slate-50 border text-slate-700 text-sm rounded-xl pl-4 pr-3 py-2.5 outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-200";
  
/**
 * Custom dropdown that replaces native <select> wherever the option list needs
 * to look on-theme (native option popups can't be styled at all) and/or the
 * select lives inside a scrollable/clipped container. The open menu renders
 * via a portal into document.body and is positioned from the trigger's real
 * screen coordinates, so it always floats above the page instead of being
 * clipped or forcing a scrollbar on an ancestor with overflow set.
 */
export default function Select({
  value,
  onChange,
  options,
  disabled = false,
  className = "",
  triggerClassName,
  menuClassName = "min-w-[160px]",
  align = "left",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: rect.bottom + 8,
        left: align === "right" ? rect.right : rect.left,
      });
    };
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    // The menu is positioned from the trigger's on-screen coordinates, which
    // go stale the moment any ancestor scrolls — close it instead of leaving
    // it floating in the wrong place, matching native <select> behavior.
    // Scroll events don't bubble but do have a capture phase, so scrolling
    // inside the menu's own overflow-y-auto list also reaches this window
    // listener — ignore those or the menu would close every time it's scrolled.
    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, align]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          typeof triggerClassName === "function"
            ? triggerClassName(open)
            : triggerClassName ??
              `${DEFAULT_TRIGGER} ${
                open
                  ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:bg-slate-800 dark:ring-cyan-500/20"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`
        }
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-cyan-500" : ""
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: coords.top,
              ...(align === "right"
                ? { left: coords.left, transform: "translateX(-100%)" }
                : { left: coords.left }),
            }}
           className={`dropdown-pop fixed rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 z-[100] dark:border-slate-700 dark:bg-slate-900 ${menuClassName}`}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-left whitespace-nowrap transition-colors ${
                    isSelected
                      ? "bg-cyan-50 text-cyan-700 font-medium dark:bg-cyan-500/15 dark:text-cyan-300"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                  {isSelected && <Check size={14} className="text-cyan-600 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
