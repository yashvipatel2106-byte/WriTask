"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

/** Matches `.field-input` sizing for form contexts. */
export function fieldSelectTriggerClass(open: boolean, extra = ""): string {
  return `flex items-center justify-between gap-2 w-full h-10 px-3.5 rounded-[14px] border bg-white text-sm text-slate-900 outline-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed dark:bg-slate-800 dark:text-slate-100 ${
    open
      ? "border-cyan-500 ring-4 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
  } ${extra}`.trim();
}

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Shown when value is empty and no matching option exists. */
  placeholder?: string;
  /** Open the menu immediately on mount (inline edit flows). */
  autoOpen?: boolean;
  /** Called whenever the open state changes (e.g. to exit inline edit on close). */
  onOpenChange?: (open: boolean) => void;
  /** Size the floating menu to the trigger width. Defaults to true. */
  matchTriggerWidth?: boolean;
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
  /** Accessible name when there is no visible label on the trigger. */
  ariaLabel?: string;
  /** z-index for the portaled menu — must exceed modal overlays (default z-[130]). */
  menuZIndexClassName?: string;
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
  placeholder,
  autoOpen = false,
  onOpenChange,
  matchTriggerWidth = true,
  className = "",
  triggerClassName,
  menuClassName = "",
  align = "left",
  ariaLabel,
  menuZIndexClassName = "z-[130]",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setOpenState = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (autoOpen && !disabled) {
      setOpenState(true);
    }
    // Only run on mount for inline-edit auto-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const pad = 8;
      const measured = menuRef.current?.offsetHeight || options.length * 44 + 16;
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const openUp =
        spaceBelow < Math.min(measured, 240) && spaceAbove > spaceBelow;
      const available = Math.max(120, openUp ? spaceAbove : spaceBelow);
      const maxHeight = Math.min(280, available);
      const width = Math.max(
        matchTriggerWidth ? rect.width : 160,
        rect.width,
        180
      );
      let left = align === "right" ? rect.right - width : rect.left;
      left = Math.min(Math.max(pad, left), window.innerWidth - width - pad);
      const top = openUp
        ? Math.max(pad, rect.top - Math.min(measured, maxHeight) - gap)
        : rect.bottom + gap;
      setCoords({ top, left, width, maxHeight });
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpenState(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      updatePosition();
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, align, options.length, matchTriggerWidth]);

  const selected = options.find((o) => o.value === value);
  const displayLabel =
    selected?.label ??
    (placeholder && !value ? placeholder : value || placeholder || "");

  const resolvedMenuClassName =
    menuClassName || (matchTriggerWidth ? "" : "min-w-[160px]");

  return (
    <div ref={rootRef} className={`relative inline-flex min-w-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpenState(!open)}
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
        <span
          className={`truncate ${!selected && placeholder && !value ? "text-slate-400 dark:text-slate-500" : ""}`}
        >
          {displayLabel}
        </span>
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
              left: coords.left,
              width: coords.width || undefined,
              maxHeight: coords.maxHeight,
            }}
            className={`dropdown-pop fixed overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 ${menuZIndexClassName} dark:border-slate-700 dark:bg-slate-900 ${resolvedMenuClassName}`}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpenState(false);
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
