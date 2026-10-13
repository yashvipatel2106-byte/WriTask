"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format, parseISO } from "date-fns";
import { Calendar as CalIcon } from "lucide-react";

type Props = {
  value: string; // "yyyy-MM-dd", "" when unset
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Themed replacement for a native <input type="date"> — same react-day-picker
 * + CSS pattern as the Team Calendar's event date picker (frontend/app/calendar/page.tsx),
 * pulled out here so any other form (e.g. Apply Leave) can reuse it instead of
 * falling back to the browser's unstyled native date dialog.
 *
 * The calendar panel renders via a portal into document.body (positioned
 * from the trigger's real screen coordinates), the same pattern
 * components/ui/Select.tsx uses — rendering it inline inside a small,
 * tightly-bounded container (e.g. a dropdown menu) let it get clipped or
 * overlap sibling controls badly enough to block clicks on them.
 */
export default function ThemedDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 6;
      const pad = 8;
      const panelWidth = panelRef.current?.offsetWidth || 300;
      const panelHeight = panelRef.current?.offsetHeight || 360;

      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;

      let left = rect.left;
      left = Math.min(Math.max(pad, left), window.innerWidth - panelWidth - pad);

      const top = openUp
        ? Math.max(pad, rect.top - panelHeight - gap)
        : rect.bottom + gap;

      setCoords({ top, left });
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
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
  }, [open]);

  const inputCls =
    "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500";

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left ${
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>
          {value ? format(parseISO(value), "MMM d, yyyy") : placeholder}
        </span>
        <CalIcon size={15} className="text-slate-400 dark:text-slate-500 shrink-0" />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: coords.top, left: coords.left }}
            className="themed-date-picker dropdown-pop fixed z-[130] w-max max-w-[95vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <DayPicker
              mode="single"
              selected={value ? parseISO(value) : undefined}
              onSelect={(d) => {
                if (!d) return;
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }}
              showOutsideDays
              fixedWeeks
            />
            <style>{`
              .themed-date-picker .rdp-root {
                --rdp-accent-color: #06b6d4;
                --rdp-accent-background-color: rgba(6, 182, 212, 0.1);
                --rdp-day_button-border-radius: 0.5rem;
                --rdp-day_button-border: 2px solid transparent;
                --rdp-selected-border: 2px solid #06b6d4;
                color: #334155;
              }
              .themed-date-picker .rdp-month_caption { color: #334155; font-weight: 600; font-size: 0.875rem; }
              .themed-date-picker .rdp-weekday { color: #64748b; font-size: 0.7rem; font-weight: 600; }
              .themed-date-picker .rdp-day_button { color: #334155; }
              .themed-date-picker .rdp-day_button:hover:not([disabled]) { background: rgba(148, 163, 184, 0.15); }
              .themed-date-picker .rdp-today .rdp-day_button { color: #0e7490; font-weight: 600; }
              .themed-date-picker .rdp-selected .rdp-day_button { color: #0e7490; font-weight: 600; background: transparent; }
              .themed-date-picker .rdp-outside .rdp-day_button { color: #94a3b8; opacity: 0.7; }
              .themed-date-picker .rdp-chevron { fill: #64748b; }
              .themed-date-picker .rdp-button_previous:hover .rdp-chevron,
              .themed-date-picker .rdp-button_next:hover .rdp-chevron { fill: #0e7490; }

              .dark .themed-date-picker .rdp-root {
                --rdp-accent-color: #22d3ee;
                --rdp-accent-background-color: rgba(34, 211, 238, 0.12);
                --rdp-selected-border: 2px solid #22d3ee;
                color: #cbd5e1;
              }
              .dark .themed-date-picker .rdp-month_caption { color: #e2e8f0; }
              .dark .themed-date-picker .rdp-weekday { color: #94a3b8; }
              .dark .themed-date-picker .rdp-day_button { color: #cbd5e1; }
              .dark .themed-date-picker .rdp-day_button:hover:not([disabled]) { background: rgba(148, 163, 184, 0.15); }
              .dark .themed-date-picker .rdp-today .rdp-day_button { color: #67e8f9; font-weight: 600; }
              .dark .themed-date-picker .rdp-selected .rdp-day_button { color: #67e8f9; font-weight: 600; background: transparent; }
              .dark .themed-date-picker .rdp-outside .rdp-day_button { color: #64748b; opacity: 0.7; }
              .dark .themed-date-picker .rdp-chevron { fill: #94a3b8; }
              .dark .themed-date-picker .rdp-button_previous:hover .rdp-chevron,
              .dark .themed-date-picker .rdp-button_next:hover .rdp-chevron { fill: #67e8f9; }
            `}</style>
          </div>,
          document.body
        )}
    </div>
  );
}
