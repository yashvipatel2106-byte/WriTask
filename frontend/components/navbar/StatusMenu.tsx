"use client";

import { useState } from "react";
import { Check, ChevronRight, RotateCcw, Timer } from "lucide-react";

import { usePresence } from "@/components/context/PresenceProvider";
import StatusBadge from "@/components/ui/StatusBadge";
import Select from "@/components/ui/Select";
import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import {
  DURATION_OPTIONS,
  MANUAL_STATUS_OPTIONS,
  type DurationKey,
  type ManualStatus,
} from "@/lib/presence";

/**
 * Mirrors Select.tsx's own DEFAULT_TRIGGER + open-state styling (same
 * bg-slate-50 field look, same focus ring treatment used everywhere
 * else a Select appears in the app) at a height that fits this compact
 * menu, instead of a one-off plainer style.
 */
function compactSelectTriggerClass(open: boolean): string {
  return `flex w-full h-9 items-center justify-between gap-2 rounded-xl border bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none transition-all dark:bg-slate-800 dark:text-slate-200 ${
    open
      ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:bg-slate-800 dark:ring-cyan-500/20 dark:border-cyan-500"
      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
  }`;
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const v = String(i + 1).padStart(2, "0");
  return { value: v, label: v };
});

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const v = String(i * 5).padStart(2, "0");
  return { value: v, label: v };
});

const PERIOD_OPTIONS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

/** 12-hour + AM/PM -> "HH:mm" (24-hour) for the backend. */
function to24Hour(hour12: string, period: string): string {
  let h = parseInt(hour12, 10) % 12;
  if (period === "PM") h += 12;
  return String(h).padStart(2, "0");
}

/**
 * Status section for the existing Navbar profile dropdown — not a
 * replacement for the menu, just an added block above the divider.
 */
export default function StatusMenu() {
  const { myStatus, setStatus, resetStatus, setVisibility } = usePresence();
  const [showDuration, setShowDuration] = useState(false);
  const [durationStatus, setDurationStatus] = useState<ManualStatus>("busy");
  const [durationKey, setDurationKey] = useState<DurationKey>("1h");
  const [customDate, setCustomDate] = useState("");
  const [customHour, setCustomHour] = useState("");
  const [customMinute, setCustomMinute] = useState("");
  const [customPeriod, setCustomPeriod] = useState("PM");

  const currentEffective = myStatus?.effective || null;
  const isAutomatic = !myStatus || myStatus.statusMode === "automatic";
  const isVisible = myStatus ? myStatus.visible : true;

  const applyDuration = async () => {
    const time =
      customHour && customMinute
        ? `${to24Hour(customHour, customPeriod)}:${customMinute}`
        : "23:59";
    const customExpiresAt =
      durationKey === "custom" && customDate ? `${customDate}T${time}` : undefined;

    await setStatus(durationStatus, durationKey, customExpiresAt);
    setShowDuration(false);
  };

  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {isAutomatic
            ? "Status — automatically determined"
            : "Status — set manually"}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={isVisible}
          aria-label={isVisible ? "Hide my status" : "Show my status"}
          title={
            isVisible
              ? "Status visible to others — click to hide"
              : "Status hidden from others — click to show"
          }
          onClick={() => setVisibility(!isVisible)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            isVisible ? "bg-cyan-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              isVisible ? "translate-x-[18px]" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {!isVisible && (
        <p className="px-4 pb-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          Your status is hidden — no one can see it right now.
        </p>
      )}

      {MANUAL_STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setStatus(option.value)}
          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <StatusBadge status={option.value} size={10} variant="inline" />
          <span className="flex-1 text-left">{option.label}</span>
          {currentEffective === option.value && !isAutomatic && (
            <Check size={15} className="text-cyan-600 dark:text-cyan-400" />
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setShowDuration((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <Timer size={15} className="shrink-0 text-slate-400" />
        <span className="flex-1 text-left">Duration</span>
        <ChevronRight
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${showDuration ? "rotate-90" : ""}`}
        />
      </button>

      {showDuration && (
        <div className="mx-4 mb-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
          <Select
            value={durationStatus}
            onChange={(value) => setDurationStatus(value as ManualStatus)}
            options={MANUAL_STATUS_OPTIONS}
            triggerClassName={compactSelectTriggerClass}
            menuClassName="min-w-[200px]"
            ariaLabel="Status"
          />

          <Select
            value={durationKey}
            onChange={(value) => setDurationKey(value as DurationKey)}
            options={DURATION_OPTIONS}
            triggerClassName={compactSelectTriggerClass}
            menuClassName="min-w-[200px]"
            ariaLabel="Duration"
          />

          {durationKey === "custom" && (
            <>
              <ThemedDatePicker
                value={customDate}
                onChange={setCustomDate}
                placeholder="Date"
              />

              {/* Hour / minute / AM-PM stay together as one time field, same line. */}
              <div className="flex gap-1.5">
                <Select
                  value={customHour}
                  onChange={setCustomHour}
                  options={HOUR_OPTIONS}
                  placeholder="Hour"
                  triggerClassName={compactSelectTriggerClass}
                  menuClassName="min-w-[80px] max-h-[220px]"
                  matchTriggerWidth={false}
                  ariaLabel="Hour"
                  className="flex-1"
                />
                <Select
                  value={customMinute}
                  onChange={setCustomMinute}
                  options={MINUTE_OPTIONS}
                  placeholder="Min"
                  triggerClassName={compactSelectTriggerClass}
                  menuClassName="min-w-[80px] max-h-[220px]"
                  matchTriggerWidth={false}
                  ariaLabel="Minute"
                  className="flex-1"
                />
                <Select
                  value={customPeriod}
                  onChange={setCustomPeriod}
                  options={PERIOD_OPTIONS}
                  triggerClassName={compactSelectTriggerClass}
                  menuClassName="min-w-[80px]"
                  matchTriggerWidth={false}
                  ariaLabel="AM/PM"
                  className="flex-1"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={applyDuration}
            disabled={durationKey === "custom" && !customDate}
            className="w-full rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => resetStatus()}
        disabled={isAutomatic}
        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <RotateCcw size={15} className="shrink-0 text-slate-400" />
        Reset status
      </button>
    </div>
  );
}
