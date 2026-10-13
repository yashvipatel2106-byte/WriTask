"use client";

import { useEffect, useState } from "react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";

const WEEKDAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
] as const;

type DaySchedule = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

type WorkingSchedule = {
  timezone: string;
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

type ResourceSettings = {
  enabled: boolean;
  hoursPerDay: number;
  hoursPerWeek: number;
  utilizationTarget: number;
};

type Props = {
  orgId: string;
  memberId: string;
  memberName: string;
  onClose: () => void;
};

export default function MemberResourcePlanningDialog({
  orgId,
  memberId,
  memberName,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [settings, setSettings] = useState<ResourceSettings>({
    enabled: true,
    hoursPerDay: 8,
    hoursPerWeek: 40,
    utilizationTarget: 80,
  });
  const [schedule, setSchedule] = useState<WorkingSchedule | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch(
        `/organizations/${orgId}/members/${memberId}/resource-settings`
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(data.message || "Failed to load resource settings");
        return;
      }
      setSettings(data.resourceSettings);
      setSchedule(data.workingSchedule);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, memberId]);

 type DayKey = Exclude<keyof WorkingSchedule, "timezone">;

const updateDay = (key: DayKey, patch: Partial<DaySchedule>) => {
  if (!schedule) return;

  setSchedule({
    ...schedule,
    [key]: {
      ...schedule[key],
      ...patch,
    },
  });
};
  const save = async () => {
    setSaving(true);
    const settingsRes = await authFetch(
      `/organizations/${orgId}/members/${memberId}/resource-settings`,
      {
        method: "PUT",
        body: JSON.stringify({ resourceSettings: settings }),
      }
    );
    const settingsData = await settingsRes.json().catch(() => ({}));
    if (!settingsRes.ok) {
      setSaving(false);
      toast.error(settingsData.message || "Failed to save resource settings");
      return;
    }
    if (schedule) {
      const scheduleRes = await authFetch(
        `/organizations/${orgId}/members/${memberId}/working-schedule`,
        {
          method: "PUT",
          body: JSON.stringify({ workingSchedule: schedule }),
        }
      );
      const scheduleData = await scheduleRes.json().catch(() => ({}));
      if (!scheduleRes.ok) {
        setSaving(false);
        toast.error(scheduleData.message || "Failed to save working schedule");
        return;
      }
      if (scheduleData.resourceSettings) setSettings(scheduleData.resourceSettings);
    }
    setSaving(false);
    toast.success("Resource planning settings saved");
    onClose();
  };

  return (
    <ModalShell onClose={onClose} maxWidth="2xl">
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-slate-200 px-6 pt-6 pb-4 dark:border-slate-800">
          <ModalHeader
            title="Resource Planning"
            subtitle={`Capacity and working schedule for ${memberName}`}
            onClose={onClose}
            className="mb-0"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span>
                  <span className="block text-sm font-semibold">Enable Resource Planning</span>
                  <span className="text-xs text-slate-500">
                    Include this member in capacity, availability, and utilization.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  Daily Capacity (hours)
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={settings.hoursPerDay}
                    onChange={(e) =>
  setSettings((prev) => ({
    ...prev,
    hoursPerDay: Number(
      e.target.value
    ),
  }))
}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="text-sm">
  Weekly Capacity (hours)

  <input
    type="number"
    value={settings.hoursPerWeek}
    readOnly
    className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
  />

  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
    Calculated automatically from the working schedule.
  </span>
</label>
                <label className="text-sm">
                  Utilization Target (%)
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.utilizationTarget}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        utilizationTarget: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowSchedule((open) => !open)}
                  className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-400/10 dark:text-cyan-300"
                >
                  {showSchedule ? "Hide Working Schedule" : "Configure Working Schedule"}
                </button>
                <p className="mt-1 text-xs text-slate-500">
                  Member working schedule is when this person is available. Task working days remain task-specific.
                </p>
              </div>

              {showSchedule && schedule && (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-semibold">Working Schedule</p>
                  {WEEKDAYS.map(([key, label]) => {
                    const day = schedule[key];
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60 sm:grid-cols-[120px_auto]"
                      >
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={day.enabled}
                            onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                          />
                          {label}
                        </label>
                        {day.enabled ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={day.startTime}
                              onChange={(e) => updateDay(key, { startTime: e.target.value })}
                              className="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                            />
                            <span>to</span>
                            <input
                              type="time"
                              value={day.endTime}
                              onChange={(e) => updateDay(key, { endTime: e.target.value })}
                              className="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                            />
                            <label className="flex items-center gap-1">
                              Break
                              <input
                                type="number"
                                min={0}
                                className="w-16 rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                                value={day.breakMinutes}
                                onChange={(e) =>
                                  updateDay(key, { breakMinutes: Number(e.target.value) })
                                }
                              />
                              min
                            </label>
                          </div>
                        ) : (
                          <span className="text-slate-500">Non-working</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
