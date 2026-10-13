"use client";

import { Check, Minus, Clock, Moon, X } from "lucide-react";
import { STATUS_META, type ManualStatus } from "@/lib/presence";

/**
 * Small circular presence/status badge — meant to sit at the
 * bottom-right corner of a user's avatar. Not an avatar replacement.
 */
export default function StatusBadge({
  status,
  size = 12,
  className = "",
  /** Overlay a corner of an avatar (default) vs. sit inline in a list/menu row. */
  variant = "overlay",
}: {
  status: ManualStatus | null | undefined;
  size?: number;
  className?: string;
  variant?: "overlay" | "inline";
}) {
  if (!status) return null;

  const meta = STATUS_META[status];
  const iconSize = Math.max(6, Math.round(size * 0.6));

  const positionClass =
    variant === "overlay"
      ? "absolute bottom-0 right-0 ring-2 ring-white dark:ring-slate-900"
      : "";

  return (
    <span
      title={meta.label}
      className={`flex items-center justify-center rounded-full ${positionClass} ${meta.dotClass} ${className}`}
      style={{ width: size, height: size }}
    >
      {meta.icon === "check" && (
        <Check size={iconSize} strokeWidth={3} className="text-white" />
      )}
      {meta.icon === "minus" && (
        <Minus size={iconSize} strokeWidth={3} className="text-white" />
      )}
      {meta.icon === "clock" && (
        <Clock size={iconSize} strokeWidth={3} className="text-white" />
      )}
      {meta.icon === "moon" && (
        <Moon size={iconSize} strokeWidth={3} className="text-white" fill="currentColor" />
      )}
      {meta.icon === "x" && (
        <X size={iconSize} strokeWidth={3} className="text-white" />
      )}
      {/* "solid" (Busy) intentionally renders no icon — a plain filled dot,
          matching the Teams-style convention of a solid red circle. */}
    </span>
  );
}
