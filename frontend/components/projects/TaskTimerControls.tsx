"use client";

import { authFetch } from "@/lib/validation/authFetch";
import {
  formatElapsedClock,
  getClientTimerBlockReason,
  getEntryElapsedMs,
  sameTaskId,
  type TimeEntryDto,
  type TimeSummaryDto,
} from "@/lib/timeTracking";
import { Pause, Play, Square, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";

type Props = {
  projectId: string;
  taskId: string;
  status: string;
  dueDate?: string | Date | null;
  effortHours?: number | null;
  canEdit: boolean;
  activeEntry: TimeEntryDto | null;
  summary: TimeSummaryDto | null;
  onActiveChange: (entry: TimeEntryDto | null) => void;
  onSummaryChange: (summary: TimeSummaryDto | null) => void;
  onEntriesMaybeChanged?: () => void;
};

type TimerAction = "start" | "pause" | "resume" | "stop";

export default function TaskTimerControls({
  projectId,
  taskId,
  status,
  dueDate,
  effortHours,
  canEdit,
  activeEntry,
  summary,
  onActiveChange,
  onSummaryChange,
  onEntriesMaybeChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const lastActionAtRef = useRef(0);

  const isActiveHere =
    Boolean(activeEntry) &&
    (activeEntry?.status === "running" || activeEntry?.status === "paused") &&
    sameTaskId(activeEntry?.task, taskId);

  const isRunningHere = isActiveHere && activeEntry?.status === "running";
  const isPausedHere = isActiveHere && activeEntry?.status === "paused";

  useEffect(() => {
    if (!isRunningHere) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunningHere]);

  useEffect(() => {
    if (!isRunningHere || !activeEntry) return;
    if (effortHours == null || effortHours <= 0) return;
    const limitMs = effortHours * 3600 * 1000;
    const completed = summary?.trackedMs ?? 0;
    const sessionElapsed = getEntryElapsedMs(activeEntry, now);
    if (completed + sessionElapsed < limitMs) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/time-entries/active`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        applyActivePayload(data);
        if (data.autoStopped) {
          toast.info("Timer automatically stopped: effort limit reached");
          onEntriesMaybeChanged?.();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isRunningHere,
    activeEntry,
    effortHours,
    now,
    summary?.trackedMs,
    taskId,
  ]);

  const blockReason = getClientTimerBlockReason(
    { status, dueDate, effortHours },
    summary?.trackedMs ?? 0
  );

  const applyActivePayload = (data: {
    entry?: TimeEntryDto | null;
    summary?: TimeSummaryDto | null;
    autoStopped?: TimeEntryDto | null;
  }) => {
    const entry = data.entry || null;
    if (
      entry &&
      (entry.status === "running" || entry.status === "paused")
    ) {
      onActiveChange(entry);
    } else {
      onActiveChange(null);
    }
    if (data.summary) onSummaryChange(data.summary);
  };

  /** If a mutation failed, recover by reading the real server timer state. */
  const syncFromServer = async (): Promise<TimeEntryDto | null> => {
    try {
      const res = await authFetch(`/time-entries/active`);
      if (!res.ok) return null;
      const data = await res.json();
      applyActivePayload(data);
      return data.entry || null;
    } catch {
      return null;
    }
  };

  const runAction = async (
    action: TimerAction,
    fn: () => Promise<{
      message?: string;
      entry?: TimeEntryDto | null;
      summary?: TimeSummaryDto | null;
    }>
  ) => {
    if (!canEdit) return;
    const nowTs = Date.now();
    if (busyRef.current || nowTs - lastActionAtRef.current < 400) return;
    lastActionAtRef.current = nowTs;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await fn();
      if (action === "stop") {
        onActiveChange(null);
      } else if (data.entry) {
        onActiveChange(data.entry);
      }
      if (data.summary) onSummaryChange(data.summary);
      onEntriesMaybeChanged?.();
      toast.success(data.message || "Done");
    } catch (e) {
      const recovered = await syncFromServer();
      onEntriesMaybeChanged?.();

      if (action === "stop") {
        if (!recovered || !sameTaskId(recovered.task, taskId)) {
          onActiveChange(null);
          toast.success("Timer stopped");
          return;
        }
      }
      if (
        (action === "pause" && recovered?.status === "paused") ||
        ((action === "resume" || action === "start") &&
          recovered?.status === "running" &&
          sameTaskId(recovered.task, taskId))
      ) {
        toast.success(
          action === "pause"
            ? "Timer paused"
            : action === "resume"
              ? "Timer resumed"
              : "Timer started"
        );
        return;
      }

      toast.error(
        e instanceof Error ? e.message : `Unable to ${action} timer`
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const parseJson = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  const start = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    void runAction("start", async () => {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${taskId}/time-entries/start`,
        { method: "POST", body: "{}" }
      );
      const data = await parseJson(res);
      if (!res.ok) {
        // Duplicate / already-active: treat as success after sync.
        if (res.status === 409 || /already/i.test(String(data.message || ""))) {
          const active = await syncFromServer();
          return {
            entry: active,
            message: data.message || "Timer already running",
          };
        }
        throw new Error(data.message || "Unable to start timer. Please try again.");
      }
      if (data.switchedFrom) {
        toast.info("Previous timer was stopped automatically");
      }
      return data;
    });
  };

  const pause = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!activeEntry || !isRunningHere) return;
    const entryId = activeEntry._id;
    void runAction("pause", async () => {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${taskId}/time-entries/${entryId}/pause`,
        { method: "POST", body: "{}" }
      );
      const data = await parseJson(res);
      if (!res.ok) {
        throw new Error(data.message || "Unable to pause timer. Please try again.");
      }
      return data;
    });
  };

  const resume = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!activeEntry || !isPausedHere) return;
    const entryId = activeEntry._id;
    void runAction("resume", async () => {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${taskId}/time-entries/${entryId}/resume`,
        { method: "POST", body: "{}" }
      );
      const data = await parseJson(res);
      if (!res.ok) {
        // Already running is success for the user.
        if (/already running/i.test(String(data.message || ""))) {
          const active = await syncFromServer();
          return {
            entry: active,
            message: "Timer already running",
          };
        }
        throw new Error(data.message || "Unable to resume timer. Please try again.");
      }
      return data;
    });
  };

  const stop = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!activeEntry || !isActiveHere) return;
    const entryId = activeEntry._id;
    void runAction("stop", async () => {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${taskId}/time-entries/${entryId}/stop`,
        { method: "POST", body: "{}" }
      );
      const data = await parseJson(res);
      if (!res.ok) {
        throw new Error(data.message || "Unable to stop timer. Please try again.");
      }
      return { ...data, entry: null };
    });
  };

  if (isActiveHere && activeEntry) {
    const elapsed = formatElapsedClock(getEntryElapsedMs(activeEntry, now));
    return (
      <div
        className="flex items-center gap-2 ml-auto shrink-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums ${
            isPausedHere
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-400/10 dark:text-cyan-300"
          }`}
          title={isPausedHere ? "Timer paused" : "Timer running"}
          aria-live="polite"
        >
          <Timer size={14} className="shrink-0" />
          {elapsed}
          {isPausedHere ? (
            <span className="font-medium opacity-80">Paused</span>
          ) : null}
        </div>
        {isRunningHere ? (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={pause}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Pause size={12} fill="currentColor" />
            Pause
          </button>
        ) : (
          <button
            type="button"
            disabled={!canEdit || busy || Boolean(blockReason)}
            onClick={resume}
            title={blockReason || "Resume timer"}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/40 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/20"
          >
            <Play size={12} fill="currentColor" />
            Resume
          </button>
        )}
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      </div>
    );
  }

  if (blockReason) {
    return (
      <div
        className="ml-auto flex max-w-[240px] flex-col items-end gap-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled
          title={blockReason}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
        >
          <Timer size={14} />
          Timer Unavailable
        </button>
        <p className="text-[10px] leading-snug text-right text-slate-400 dark:text-slate-500">
          {blockReason}
        </p>
      </div>
    );
  }

  return (
    <div
      className="ml-auto shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!canEdit || busy}
        onClick={start}
        title="Start timer for this task"
        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/40 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/20"
      >
        <Play size={12} fill="currentColor" />
        {busy ? "Starting…" : "Start Timer"}
      </button>
    </div>
  );
}
