"use client";

import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import {
  formatHoursMinutes,
  stopReasonLabel,
  type TimeEntryDto,
  type TimeSummaryDto,
} from "@/lib/timeTracking";
import { format } from "date-fns";

type Props = {
  entries: TimeEntryDto[];
  summary: TimeSummaryDto | null;
  loading?: boolean;
};

function formatStamp(iso?: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy h:mm a");
  } catch {
    return iso;
  }
}

function formatTimeOnly(iso?: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "h:mm a");
  } catch {
    return iso;
  }
}

export default function TaskTimeLogPanel({ entries, summary, loading }: Props) {
  if (loading) {
    return (
      <div className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
        Loading time log…
      </div>
    );
  }

  const over = Boolean(summary?.overEffortMs && summary.overEffortMs > 0);

  return (
    <div className="px-6 py-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Time Log
        </h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium text-slate-400">Tracked</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {summary?.trackedLabel || "00h 00m"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium text-slate-400">Effort</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {summary?.effortLabel || "—"}
            </p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2.5 ${
              over
                ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
            }`}
          >
            <p className="text-[11px] font-medium text-slate-400">
              {over ? "Over effort" : "Remaining"}
            </p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                over
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {over
                ? summary?.overEffortLabel
                : summary?.remainingLabel ||
                  (summary?.effortMs == null ? "—" : "00h 00m")}
            </p>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No time logged yet. Start the timer while the task is In Progress.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Stopped</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => {
                const person = entry.user;
                return (
                  <tr key={entry._id} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {person ? (
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                              avatarBg(
                                person.avatarColor,
                                person._id || person.username
                              ).className
                            }`}
                            style={
                              avatarBg(
                                person.avatarColor,
                                person._id || person.username
                              ).style
                            }
                          >
                            {avatarInitials(person.username)}
                          </span>
                        ) : null}
                        <span className="truncate text-slate-800 dark:text-slate-100">
                          {person?.username || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                      <div className="tabular-nums">{formatTimeOnly(entry.startedAt)}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatStamp(entry.startedAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                      {entry.endedAt ? (
                        <>
                          <div className="tabular-nums">
                            {formatTimeOnly(entry.endedAt)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {formatStamp(entry.endedAt)}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                      {entry.status === "running"
                        ? "Running"
                        : entry.status === "paused"
                          ? "Paused"
                          : formatHoursMinutes(entry.durationMs || 0)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {entry.status === "running"
                        ? "Running"
                        : entry.status === "paused"
                          ? "Paused"
                          : stopReasonLabel(entry.stopReason)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
