"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar  from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format, parseISO } from "date-fns";

import {
  ChevronLeft, ChevronRight, Plus, X, Check, Clock,
  Calendar as CalIcon, Users, Briefcase, Filter,
  Search, RefreshCw, AlertCircle, Loader2,
  ClipboardList, Bell, Flame,
} from "lucide-react";

import {
  fetchCalendarEvents,
  fetchMemberCalendarEvents,
  fetchMemberAssignedTasks,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  fetchOrgMembers,
  fetchOrgProjects,
  syncTasksToCalendar,
  type CalendarEventAPI,
  type OrgMemberWithStats,
  type MemberAssignedTask,
  type CreateEventPayload,
  type CalendarProjectOption,
}  from "@/lib/validation/calendarApi";  // adjust path if you place calendarApi.ts elsewhere
import { useOrganization } from "@/components/context/organizationContext";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import { ModalShell } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/confirm";
import Select from "@/components/ui/Select";
import { buildStatusOptions } from "@/lib/taskStatuses";
import { fetchUsersOnLeave } from "@/lib/validation/leaveApi";

// Meetings
import{
  startMeeting,
  joinMeeting,
} from "@/lib/validation/calendarApi";
// meeting handlers will be defined inside the component where orgId, router and showToast are available
// ── constants ──────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SPACES = ["Internal", "Personal", "Client", "External"];
const SPACE_FILTER_OPTIONS = [
  { value: "all", label: "All Spaces" },
  ...SPACES.map((s) => ({ value: s, label: s })),
];

type EventType = CalendarEventAPI["type"];
type Priority  = CalendarEventAPI["priority"];

// "leave" is deliberately excluded — leave events are filtered out of the
// Team Calendar entirely (see loadData), so no style is needed for them here.
const TYPE_STYLES: Partial<Record<EventType, { bg: string; text: string; dot: string; border: string }>> = {
  task:      { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-700 dark:text-blue-400",       dot: "bg-blue-400",    border: "border-blue-300 dark:border-blue-500/30"       },
  meeting:   { bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-700 dark:text-violet-400",   dot: "bg-violet-400",  border: "border-violet-300 dark:border-violet-500/30"   },
  reminder:  { bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-400",     dot: "bg-amber-400",   border: "border-amber-300 dark:border-amber-500/30"      },
};
// Fallback for event types with no entry above — covers "leave" (excluded
// on purpose) and legacy "deadline" rows created before the type was renamed
// to "reminder" — reads straight from the DB, so old values can still show
// up here without a migration. Avoids a hard crash on TYPE_STYLES[unknownType].
const FALLBACK_TYPE_STYLE = {
  bg: "bg-slate-50 dark:bg-slate-500/10",
  text: "text-slate-600 dark:text-slate-400",
  dot: "bg-slate-400",
  border: "border-slate-300 dark:border-slate-500/30",
};
function typeStyle(type: string) {
  return TYPE_STYLES[type as EventType] || FALLBACK_TYPE_STYLE;
}
// Icon + icon-box colors for the stats row cards — same "label/count on the
// left, colored icon tile on the right" layout as the dashboard's stat cards.
const STATS_ICON: Record<"task" | "meeting" | "reminder", { Icon: typeof ClipboardList; iconBg: string; iconText: string }> = {
  task:     { Icon: ClipboardList, iconBg: "bg-blue-100 dark:bg-blue-500/10",     iconText: "text-blue-600 dark:text-blue-400"    },
  meeting:  { Icon: Users,         iconBg: "bg-violet-100 dark:bg-violet-500/10", iconText: "text-violet-600 dark:text-violet-400" },
  reminder: { Icon: Bell,          iconBg: "bg-amber-100 dark:bg-amber-500/10",   iconText: "text-amber-600 dark:text-amber-400"   },
};
const PRIORITY_STYLES: Record<Priority, { text: string; bg: string }> = {
  low:    { text: "text-slate-600 dark:text-slate-300",  bg: "bg-slate-100 dark:bg-slate-800" },
  medium: { text: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10" },
  high:   { text: "text-red-700 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10"    },
};

// ── helpers ────────────────────────────────────────────────────────────────
function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function monthParam(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Project label for a calendar event — prefers linked task project, then denormalized name. */
function eventProjectName(e: CalendarEventAPI): string {
  return (
    e.taskRef?.project?.title?.trim() ||
    e.projectName?.trim() ||
    ""
  );
}

/** Accept a bare room id or a full /meeting/... link */
function extractRoomId(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/meeting/")) {
    const part = trimmed.split("/meeting/")[1]?.split(/[?#]/)[0];
    return part || null;
  }
  return trimmed;
}

// ── sub-components ─────────────────────────────────────────────────────────

function Avatar({ user, size = "sm" }: { user: { _id: string; username: string; avatarColor?: string }; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-9 h-9 text-sm" : size === "md" ? "w-7 h-7 text-xs" : "w-6 h-6 text-[10px]";
  const bg = avatarBg(user.avatarColor, user._id);
  return (
    <div
      title={user.username}
      className={`${sz} ${bg.className} rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shrink-0 uppercase`}
      style={bg.style}
    >
      {avatarInitials(user.username)}
    </div>
  );
}

function AvatarGroup({ users, max = 4 }: { users: CalendarEventAPI["assignees"]; max?: number }) {
  const shown = users.slice(0, max);
  const rest  = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map(u => <Avatar key={u._id} user={u} size="sm" />)}
      {rest > 0 && (
        <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-[10px] text-slate-500 font-bold ring-2 ring-white dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-900">
          +{rest}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalShell onClose={onClose} maxWidth="md" className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 text-xl dark:text-slate-100">{title}</h2>
        <button onClick={onClose} className="btn btn-ghost btn-sm !px-2"><X size={18} /></button>
      </div>
      <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
    </ModalShell>
  );
}

const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500";

// ── EventForm ─────────────────────────────────────────────────────────────
function EventForm({
  initial, defaultDate, members, projects, orgId, onSave, onCancel, saving, onDirtyChange,
}: {
  initial?: CalendarEventAPI;
  defaultDate?: string;
  members: OrgMemberWithStats[];
  projects: CalendarProjectOption[];
  orgId: string;
  onSave: (d: CreateEventPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState<CreateEventPayload>({
    title:       initial?.title       ?? "",
    date:        initial?.date        ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    time:        initial?.time        ?? "09:00",
    type:        initial?.type        ?? "task",
    priority:    initial?.priority    ?? "medium",
    description: initial?.description ?? "",
    space:       initial?.space       ?? "Internal",
    assignees:   initial?.assignees?.map(a => a._id) ?? [],
    projectId:   initial?.taskRef?.project?._id ?? "",
    status:      initial?.taskRef?.status ?? "todo",
  });
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Baseline snapshot from the very first render (either the event being
  // edited, or the blank-create defaults) — compared against the live form
  // to decide whether Close/Cancel should confirm before discarding.
  const initialFormSigRef = useRef(JSON.stringify(form));
  const hasUnsavedChanges = JSON.stringify(form) !== initialFormSigRef.current;

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges]);

  // A pre-existing task-type event that was never linked to a real Task
  // (created before this feature shipped) — editing it should keep working
  // exactly as it did before, without suddenly forcing a Project/Status pick.
  const isLegacyUnlinkedTaskEvent = Boolean(initial && initial.type === "task" && !initial.taskRef);
  const requiresTaskFields = form.type === "task" && !isLegacyUnlinkedTaskEvent;

  // Only offer projects that every currently-selected assignee actually
  // belongs to — you shouldn't be able to create a task in a project an
  // assignee isn't a member of. With no assignees picked yet, fall back to
  // every project the event creator (you) can already access.
  const selectedAssigneeIds = form.assignees ?? [];
  const availableProjects = selectedAssigneeIds.length === 0
    ? projects
    : projects.filter((p) =>
        selectedAssigneeIds.every((aid) => p.members.some((m) => m.user === aid))
      );

  const selectedProject = availableProjects.find((p) => p._id === form.projectId);
  const statusOptions = buildStatusOptions(selectedProject?.customStatuses ?? []);

  // If narrowing the project list (by picking/changing assignees) drops the
  // currently-chosen project out of the allowed set, clear it instead of
  // silently letting an invalid project stay selected.
  useEffect(() => {
    if (form.projectId && !availableProjects.some((p) => p._id === form.projectId)) {
      setForm((f) => ({ ...f, projectId: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssigneeIds.join(","), form.projectId]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!datePickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!datePickerRef.current?.contains(e.target as Node)) setDatePickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [datePickerOpen]);

  useEffect(() => {
    if (!timePickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!timePickerRef.current?.contains(e.target as Node)) setTimePickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [timePickerOpen]);

  useEffect(() => {
    if (!timePickerOpen) return;
    // Manual scroll offset (not scrollIntoView) so this only scrolls the
    // hour/minute column itself, not the modal body around it.
    timePickerRef.current
      ?.querySelectorAll<HTMLElement>(".event-time-cell.is-active")
      .forEach((el) => {
        const col = el.parentElement;
        if (!col) return;
        col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2;
      });
  }, [timePickerOpen]);

  const [time24Hour, time24Minute] = (form.time || "09:00").split(":").map(Number);
  const timePeriod  = time24Hour >= 12 ? "PM" : "AM";
  const time12Hour  = time24Hour % 12 === 0 ? 12 : time24Hour % 12;

  const setTimeParts = (h12: number, minute: number, period: "AM" | "PM") => {
    let h = h12 % 12;
    if (period === "PM") h += 12;
    set("time", `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  };

  const set = <K extends keyof CreateEventPayload>(k: K, v: CreateEventPayload[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // Who's on approved leave for the currently-picked date — refreshed
  // whenever the date changes, so the assignee list can block picking them
  // and explain why.
  const [onLeaveUserIds, setOnLeaveUserIds] = useState<Set<string>>(new Set());
  // Inline message under Assignees (not a page toast — those sit behind the modal).
  const [assigneeLeaveMessage, setAssigneeLeaveMessage] = useState("");

  useEffect(() => {
    if (!orgId || !form.date) {
      setOnLeaveUserIds(new Set());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const onLeave = await fetchUsersOnLeave(orgId, form.date);
        if (!cancelled) setOnLeaveUserIds(new Set(onLeave.map((o) => o.userId)));
      } catch {
        if (!cancelled) setOnLeaveUserIds(new Set());
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId, form.date]);

  const leaveNamesFor = (ids: string[]) =>
    ids
      .map(
        (id) =>
          members.find((m) => m.user._id === id)?.user.username || "This person"
      )
      .filter(Boolean);

  // If the date changes and already-selected people are now on leave, warn
  // in the assignee section (and keep the selection so they can deselect).
  useEffect(() => {
    const selectedOnLeave = (form.assignees ?? []).filter((id) =>
      onLeaveUserIds.has(id)
    );
    if (selectedOnLeave.length > 0) {
      const names = leaveNamesFor(selectedOnLeave);
      setAssigneeLeaveMessage(
        names.length === 1
          ? `${names[0]} is on leave on ${form.date}. Deselect them or pick another date.`
          : `${names.join(", ")} are on leave on ${form.date}. Deselect them or pick another date.`
      );
      return;
    }
    // Drop only the auto "selected assignee on leave" warning — keep a
    // just-clicked "this person is on leave" tip until the user picks someone else.
    setAssigneeLeaveMessage((prev) =>
      /Deselect them or pick another date/.test(prev) ? "" : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.assignees, onLeaveUserIds, members]);

  const toggleAssignee = (id: string) => {
    const isSelected = (form.assignees ?? []).includes(id);
    if (!isSelected && onLeaveUserIds.has(id)) {
      const name =
        members.find((m) => m.user._id === id)?.user.username || "This person";
      setAssigneeLeaveMessage(
        `${name} is on leave on ${form.date}. Choose someone else or pick a different date.`
      );
      return;
    }
    setAssigneeLeaveMessage("");
    set(
      "assignees",
      isSelected
        ? (form.assignees ?? []).filter((x) => x !== id)
        : [...(form.assignees ?? []), id]
    );
  };

  const selectedAssigneesOnLeave = (form.assignees ?? []).filter((id) =>
    onLeaveUserIds.has(id)
  );

  const valid = Boolean(
    form.title.trim() &&
      form.date &&
      (!requiresTaskFields || (form.projectId && form.status))
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Title</label>
        <input className={inputCls} placeholder="Event title" value={form.title} onChange={e => set("title", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="relative" ref={datePickerRef}>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Date</label>
          <button
            type="button"
            onClick={() => setDatePickerOpen(o => !o)}
            className={inputCls + " flex items-center justify-between gap-2 cursor-pointer text-left"}
          >
            <span>{form.date ? format(parseISO(form.date), "MMM d, yyyy") : "Select date"}</span>
            <CalIcon size={15} className="text-slate-400 dark:text-slate-500 shrink-0" />
          </button>
          {datePickerOpen && (
            <div className="event-date-picker absolute left-0 top-full z-30 mt-2 w-max max-w-[95vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <DayPicker
                mode="single"
                selected={form.date ? parseISO(form.date) : undefined}
                onSelect={(d) => {
                  if (!d) return;
                  set("date", format(d, "yyyy-MM-dd"));
                  setDatePickerOpen(false);
                }}
                showOutsideDays
                fixedWeeks
              />
              <style>{`
                .event-date-picker .rdp-root {
                  --rdp-accent-color: #06b6d4;
                  --rdp-accent-background-color: rgba(6, 182, 212, 0.1);
                  --rdp-day_button-border-radius: 0.5rem;
                  --rdp-day_button-border: 2px solid transparent;
                  --rdp-selected-border: 2px solid #06b6d4;
                  color: #334155;
                }
                .event-date-picker .rdp-month_caption { color: #334155; font-weight: 600; font-size: 0.875rem; }
                .event-date-picker .rdp-weekday { color: #64748b; font-size: 0.7rem; font-weight: 600; }
                .event-date-picker .rdp-day_button { color: #334155; }
                .event-date-picker .rdp-day_button:hover:not([disabled]) { background: rgba(148, 163, 184, 0.15); }
                .event-date-picker .rdp-today .rdp-day_button { color: #0e7490; font-weight: 600; }
                .event-date-picker .rdp-selected .rdp-day_button { color: #0e7490; font-weight: 600; background: transparent; }
                .event-date-picker .rdp-outside .rdp-day_button { color: #94a3b8; opacity: 0.7; }
                .event-date-picker .rdp-chevron { fill: #64748b; }
                .event-date-picker .rdp-button_previous:hover .rdp-chevron,
                .event-date-picker .rdp-button_next:hover .rdp-chevron { fill: #0e7490; }

                .dark .event-date-picker .rdp-root {
                  --rdp-accent-color: #22d3ee;
                  --rdp-accent-background-color: rgba(34, 211, 238, 0.12);
                  --rdp-selected-border: 2px solid #22d3ee;
                  color: #cbd5e1;
                }
                .dark .event-date-picker .rdp-month_caption { color: #e2e8f0; }
                .dark .event-date-picker .rdp-weekday { color: #94a3b8; }
                .dark .event-date-picker .rdp-day_button { color: #cbd5e1; }
                .dark .event-date-picker .rdp-day_button:hover:not([disabled]) { background: rgba(148, 163, 184, 0.15); }
                .dark .event-date-picker .rdp-today .rdp-day_button { color: #67e8f9; font-weight: 600; }
                .dark .event-date-picker .rdp-selected .rdp-day_button { color: #67e8f9; font-weight: 600; background: transparent; }
                .dark .event-date-picker .rdp-outside .rdp-day_button { color: #64748b; opacity: 0.7; }
                .dark .event-date-picker .rdp-chevron { fill: #94a3b8; }
                .dark .event-date-picker .rdp-button_previous:hover .rdp-chevron,
                .dark .event-date-picker .rdp-button_next:hover .rdp-chevron { fill: #67e8f9; }
              `}</style>
            </div>
          )}
        </div>
        <div className="relative" ref={timePickerRef}>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Time</label>
          <button
            type="button"
            onClick={() => setTimePickerOpen(o => !o)}
            className={inputCls + " flex items-center justify-between gap-2 cursor-pointer text-left"}
          >
            <span>{String(time12Hour).padStart(2, "0")}:{String(time24Minute).padStart(2, "0")} {timePeriod}</span>
            <Clock size={15} className="text-slate-400 dark:text-slate-500 shrink-0" />
          </button>
          {timePickerOpen && (
            <div className="event-time-picker absolute left-0 top-full z-30 mt-2 flex gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="event-time-col flex max-h-48 w-14 flex-col overflow-y-auto">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setTimeParts(h, time24Minute, timePeriod)}
                    className={`event-time-cell rounded-lg px-2 py-1.5 text-sm text-center ${h === time12Hour ? "is-active" : ""}`}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="event-time-col flex max-h-48 w-14 flex-col overflow-y-auto">
                {Array.from({ length: 60 }, (_, i) => i).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTimeParts(time12Hour, m, timePeriod)}
                    className={`event-time-cell rounded-lg px-2 py-1.5 text-sm text-center ${m === time24Minute ? "is-active" : ""}`}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="flex w-14 flex-col gap-1">
                {(["AM", "PM"] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTimeParts(time12Hour, time24Minute, p)}
                    className={`event-time-cell rounded-lg px-2 py-1.5 text-sm text-center ${p === timePeriod ? "is-active" : ""}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <style>{`
                .event-time-col {
                  scrollbar-width: thin;
                  scrollbar-color: #cbd5e1 transparent;
                }
                .event-time-col::-webkit-scrollbar {
                  width: 5px;
                }
                .event-time-col::-webkit-scrollbar-track {
                  background: transparent;
                }
                .event-time-col::-webkit-scrollbar-thumb {
                  background-color: #cbd5e1;
                  border-radius: 999px;
                }
                .dark .event-time-col {
                  scrollbar-color: #475569 transparent;
                }
                .dark .event-time-col::-webkit-scrollbar-thumb {
                  background-color: #475569;
                }
                .event-time-cell {
                  color: #334155;
                  font-weight: 500;
                }
                .event-time-cell:hover {
                  background: rgba(148, 163, 184, 0.15);
                }
                .event-time-cell.is-active {
                  background: #06b6d4;
                  color: white;
                }
                .dark .event-time-cell {
                  color: #cbd5e1;
                }
                .dark .event-time-cell:hover {
                  background: rgba(148, 163, 184, 0.15);
                }
                .dark .event-time-cell.is-active {
                  background: #22d3ee;
                  color: #04121a;
                }
              `}</style>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Type</label>
        <div className="grid grid-cols-3 gap-1.5">
          {(["task","meeting","reminder"] as EventType[]).map(t => (
            <button key={t} type="button" onClick={() => set("type", t)}
              className={`py-2 px-1 rounded-xl text-xs capitalize font-medium transition-all ${
                form.type === t
                  ? `${typeStyle(t).bg} ${typeStyle(t).text} ring-1 ring-current`
                  : "bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 dark:border-slate-700"
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      {form.type === "task" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Project</label>
            <Select
              value={form.projectId || "__placeholder"}
              onChange={(v) => set("projectId", v === "__placeholder" ? "" : v)}
              options={[
                { value: "__placeholder", label: "Select project" },
                ...availableProjects.map((p) => ({ value: p._id, label: p.title })),
              ]}
              disabled={availableProjects.length === 0}
              className="w-full"
              triggerClassName={(open) =>
                `flex items-center justify-between gap-2 w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-slate-900 text-sm outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                  attemptedSubmit && requiresTaskFields && !form.projectId
                    ? "border-red-400 dark:border-red-500"
                    : open
                    ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                    : "border-slate-200 dark:border-slate-700"
                }`
              }
            />
            {attemptedSubmit && requiresTaskFields && !form.projectId && (
              <p className="text-xs text-red-500 mt-1">Project is required</p>
            )}
            {selectedAssigneeIds.length > 0 && availableProjects.length === 0 && (
              <p className="text-xs text-amber-500 mt-1">
                No project has all the selected assignees as members.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Status</label>
            <Select
              value={form.status || "todo"}
              onChange={(v) => set("status", v)}
              options={statusOptions}
              className="w-full"
              triggerClassName={(open) =>
                `flex items-center justify-between gap-2 w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-slate-900 text-sm outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                  attemptedSubmit && requiresTaskFields && !form.status
                    ? "border-red-400 dark:border-red-500"
                    : open
                    ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                    : "border-slate-200 dark:border-slate-700"
                }`
              }
            />
            {attemptedSubmit && requiresTaskFields && !form.status && (
              <p className="text-xs text-red-500 mt-1">Status is required</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Priority</label>
          <div className="flex gap-1.5">
            {(["low","medium","high"] as Priority[]).map(p => (
              <button key={p} type="button" onClick={() => set("priority", p)}
                className={`flex-1 py-2 rounded-xl text-xs capitalize font-medium transition-all ${
                  form.priority === p
                    ? `${PRIORITY_STYLES[p].bg} ${PRIORITY_STYLES[p].text} ring-1 ring-current`
                    : "bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 dark:border-slate-700"
                }`}
              >{p}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Space</label>
          <Select
            value={form.space ?? "Internal"}
            onChange={(v) => set("space", v)}
            options={SPACES.map((s) => ({ value: s, label: s }))}
            className="w-full"
            triggerClassName={(open) =>
              `flex items-center justify-between gap-2 w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-slate-900 text-sm outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                open
                  ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                  : "border-slate-200 dark:border-slate-700"
              }`
            }
          />
        </div>
      </div>

      {/* Org members as assignees */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block dark:text-slate-400">
          Assignees — {members.length} org members
        </label>
        {members.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Loading members…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto overflow-x-hidden p-0.5 pr-1">
            {members.map(({ user }) => {
              const active = (form.assignees ?? []).includes(user._id);
              const onLeave = onLeaveUserIds.has(user._id);
              return (
                <button key={`${user._id}-${user.email}`}  type="button"
                  onClick={() => toggleAssignee(user._id)}
                  title={onLeave ? `${user.username} is on leave on ${form.date}` : undefined}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-all text-left ${
                    onLeave
                      ? "bg-rose-50 border-rose-200 text-rose-400 cursor-not-allowed opacity-70 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400"
                      : active
                        ? "bg-cyan-50 border-cyan-400 text-cyan-700 dark:bg-cyan-500/10 dark:border-cyan-500/50 dark:text-cyan-400"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  <div
                    className={`w-6 h-6 ${avatarBg(user.avatarColor, user._id).className} rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 uppercase ${onLeave ? "opacity-50" : ""}`}
                    style={avatarBg(user.avatarColor, user._id).style}
                  >
                    {avatarInitials(user.username)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.username}</p>
                    {onLeave ? (
                      <p className="truncate text-[10px] text-rose-500 dark:text-rose-400">On leave</p>
                    ) : user.designation ? (
                      <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{user.designation}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {(form.assignees?.length ?? 0) > 0 && (
          <p className="text-xs text-slate-400 mt-1.5 dark:text-slate-500">{form.assignees?.length} selected</p>
        )}
        {assigneeLeaveMessage && (
          <div
            role="alert"
            className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {assigneeLeaveMessage}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400">Description</label>
        <textarea rows={2} className={inputCls + " resize-none"} placeholder="Optional details…"
          value={form.description} onChange={e => set("description", e.target.value)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-secondary flex-1">Cancel</button>
        <button
          type="button"
          onClick={async () => {
            setAttemptedSubmit(true);
            if (!valid) return;
            if (selectedAssigneesOnLeave.length > 0) {
              const names = leaveNamesFor(selectedAssigneesOnLeave);
              setAssigneeLeaveMessage(
                names.length === 1
                  ? `${names[0]} is on leave on ${form.date}. Deselect them or pick another date.`
                  : `${names.join(", ")} are on leave on ${form.date}. Deselect them or pick another date.`
              );
              return;
            }
            const payload = { ...form };
            if (payload.type !== "task") {
              delete payload.projectId;
              delete payload.status;
            }
            try {
              await onSave(payload);
            } catch (e: unknown) {
              const message =
                e instanceof Error ? e.message : "Could not save event.";
              if (/on leave/i.test(message)) {
                setAssigneeLeaveMessage(message);
              } else {
                setAssigneeLeaveMessage(message);
              }
            }
          }}
          disabled={saving}
          className="btn btn-primary flex-1"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {initial ? "Save changes" : "Add event"}
        </button>
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOrgId } = useOrganization();
  const today  = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  // ── org id from localStorage (set at login) ──────────────────────────────
  const [orgId, setOrgId] = useState<string>("");

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [events,  setEvents]  = useState<CalendarEventAPI[]>([]);
  const [members, setMembers] = useState<OrgMemberWithStats[]>([]);
  const [projects, setProjects] = useState<CalendarProjectOption[]>([]);
  const [spaceFilter, setSpaceFilter] = useState("all");

  const [loading,    setLoading]    = useState(true);
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [syncing,    setSyncing]    = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editEvent,    setEditEvent]    = useState<CalendarEventAPI | null>(null);
  // Tracked by EventForm (create or edit — only one is ever open at once) so
  // the X button / backdrop / Cancel button can all ask before discarding.
  const [eventFormDirty, setEventFormDirty] = useState(false);
  const closeEventForm = useCallback(async (doClose: () => void) => {
    if (eventFormDirty) {
      const discard = await confirmDialog({
        title: "Discard unsaved changes?",
        description: "You have unsaved edits on this event. Close without saving?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!discard) return;
    }
    doClose();
  }, [eventFormDirty]);
  const [viewEvent,    setViewEvent]    = useState<CalendarEventAPI | null>(null);
  // Member whose Team-panel count badge was clicked — shows a breakdown of
  // that person's assigned tasks (all) plus month-scoped meetings/reminders.
  const [breakdownMember, setBreakdownMember] = useState<OrgMemberWithStats["user"] | null>(null);
  const [breakdownYear,  setBreakdownYear]  = useState(today.getFullYear());
  const [breakdownMonth, setBreakdownMonth] = useState(today.getMonth());
  const [breakdownEvents, setBreakdownEvents] = useState<CalendarEventAPI[]>([]);
  const [breakdownTasks, setBreakdownTasks] = useState<MemberAssignedTask[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [filterType,   setFilterType]   = useState<EventType | "all" | "high-priority">("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [myTasksOnly,  setMyTasksOnly]  = useState(false);

  const currentUserId = useRef<string | null>(null);


  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const createdById =
  typeof viewEvent?.createdBy === "string"
    ? viewEvent.createdBy
    : viewEvent?.createdBy?._id;


  // ── auth + org bootstrap ─────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return;}

    const q = searchParams.get("q");
    if (q) setSearchQuery(q);

    const storedOrg =
      searchParams.get("org") || currentOrgId || "";
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    currentUserId.current = user.id || user._id || null;

   if (!storedOrg) {
  setApiError(
    "No organization found. Please create or select an organization first."
  );

  setLoading(false);
  return;
}
    setOrgId(storedOrg);
  }, [router, searchParams, currentOrgId]);

  // ── load events + members + projects whenever orgId/month/space changes ──
  const loadData = useCallback(async (oId: string, y: number, m: number, space: string) => {
    if (!oId) return;
    setLoading(true);
    setApiError(null);
    try {
      const mp = monthParam(y, m);
      const [evts, mems, projs] = await Promise.all([
        // Shared Team Calendar — every org member's events, not just this
        // user's own. "Mine only" (myTasksOnly) then filters client-side.
        fetchCalendarEvents(oId, mp, space, true),
        fetchOrgMembers(oId, mp),
        fetchOrgProjects(oId),
      ]);
      // Leave events (created by the leave-approval flow) are deliberately
      // excluded from the Team Calendar — that functionality lives entirely
      // in Settings > Leave now, not here.
      setEvents(evts.filter((e) => e.type !== "leave"));
      // The API can return the same person more than once (e.g. duplicate
      // membership records) — dedupe by user id so keys stay unique and
      // assignee pickers don't show the same person twice.
      setMembers([...new Map(mems.map((m) => [m.user._id, m])).values()]);
      setProjects(projs);
    } catch (e: any) {
      setApiError(e.message ?? "Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, []);

 useEffect(() => {
  if (!orgId) return;

  // const initializeCalendar = async () => {
  //   try {
  //     await syncTasksToCalendar(orgId);
  //   } catch (err) {
  //     console.error("Task sync failed:", err);
  //   }

    // await hatu 
   loadData(orgId, year, month, spaceFilter);

  // };

  // initializeCalendar();
}, [orgId, year, month, spaceFilter, loadData]);

// Loads the selected member's assigned tasks (all) plus month-scoped
// meetings/reminders for the breakdown modal.
useEffect(() => {
  if (!breakdownMember || !orgId) return;
  let cancelled = false;
  setBreakdownLoading(true);
  Promise.all([
    fetchMemberAssignedTasks(orgId, breakdownMember._id),
    fetchMemberCalendarEvents(
      orgId,
      breakdownMember._id,
      monthParam(breakdownYear, breakdownMonth)
    ),
  ])
    .then(([tasks, evts]) => {
      if (cancelled) return;
      setBreakdownTasks(tasks);
      setBreakdownEvents(evts.filter((e) => e.type !== "leave"));
    })
    .catch(() => {
      if (cancelled) return;
      setBreakdownTasks([]);
      setBreakdownEvents([]);
    })
    .finally(() => {
      if (!cancelled) setBreakdownLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [breakdownMember, breakdownYear, breakdownMonth, orgId]);

const isCurrentUserCreator =
  Boolean(createdById) && createdById === currentUserId.current;

const isMeetingAssignee = Boolean(
  viewEvent?.assignees?.some((a) => a._id === currentUserId.current)
);

const meetingStatus = viewEvent?.meeting?.status;

  // ── month navigation ─────────────────────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0);  } else setMonth(m => m+1); };

  // ── calendar grid ────────────────────────────────────────────────────────
  const firstDay  = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysCount }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── filtered events ───────────────────────────────────────────────────────
  const searchNeedle = searchQuery.trim().toLowerCase();
  const filteredEvents = events.filter(e => {
    if (filterType === "high-priority") {
      if (e.priority !== "high") return false;
    } else if (filterType !== "all" && e.type !== filterType) return false;
    if (searchNeedle) {
      const haystack = [
        e.title,
        e.description,
        e.type,
        e.priority,
        e.space,
        eventProjectName(e),
        ...(e.assignees || []).map((a) => a.username),
        typeof e.createdBy === "object" ? e.createdBy?.username : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchNeedle)) return false;
    }
    if (myTasksOnly && currentUserId.current) {
      // "Mine only" = assigned to me specifically — not just created by me.
      const isAssigned = e.assignees.some(a => a._id === currentUserId.current);
      if (!isAssigned) return false;
    }
    return true;
  });

  const eventMap: Record<string, CalendarEventAPI[]> = {};
  filteredEvents.forEach(e => {
    if (!eventMap[e.date]) eventMap[e.date] = [];
    eventMap[e.date].push(e);
  });

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleCreate = async (data: CreateEventPayload) => {
    setSaving(true);
    try {
      const created = await createCalendarEvent(orgId, data);
      setEvents((p) => [...p, created]);
      setShowCreate(false);
      showToast("Event added ✓");
    } catch (e: any) {
      // Leave / assignee validation errors are shown inline in EventForm.
      if (/on leave/i.test(e?.message || "")) throw e;
      showToast("Error: " + e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: CreateEventPayload) => {
    if (!editEvent) return;
    setSaving(true);
    try {
      const updated = await updateCalendarEvent(orgId, editEvent._id, data);
      setEvents((p) => p.map((e) => (e._id === updated._id ? updated : e)));
      setEditEvent(null);
      showToast("Event updated ✓");
    } catch (e: any) {
      if (/on leave/i.test(e?.message || "")) throw e;
      showToast("Error: " + e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCalendarEvent(orgId, id);
      setEvents(p => p.filter(e => e._id !== id));
      setViewEvent(null);
      setEditEvent(null);
      showToast("Event removed");
    } catch (e: any) {
      showToast("Error: " + e.message);
    }
  };
  const handleStartMeeting = async (event: CalendarEventAPI) => {
    try {
      const res = await startMeeting(orgId, event._id);

      const meeting: CalendarEventAPI["meeting"] = res.data.meeting
        ? {
            ...res.data.meeting,
            status: res.data.meeting.status ?? "live",
            roomId:
              res.data.meeting.roomId ||
              res.roomId ||
              extractRoomId(res.meetingLink) ||
              null,
          }
        : {
            status: "live",
            roomId: res.roomId || extractRoomId(res.meetingLink) || null,
          };

      setEvents((prev) =>
        prev.map((e) => (e._id === event._id ? { ...e, meeting } : e))
      );

      setViewEvent((prev) => (prev ? { ...prev, meeting } : prev));

      const roomId = extractRoomId(
        res.roomId ||
          res.data.meeting?.roomId ||
          res.meetingLink ||
          res.data.meeting?.meetingLink
      );

      if (roomId) {
        router.push(`/meeting/${roomId}`);
      } else {
        showToast("Meeting room is not ready yet");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Unable to start meeting");
    }
  };

  const handleJoinMeeting = async (event: CalendarEventAPI) => {
    try {
      // Owner can re-enter a live room; if roomId is missing (legacy), start repairs it
      if (event.meeting?.status === "live" && isCurrentUserCreator) {
        const existing = extractRoomId(
          event.meeting?.roomId || event.meeting?.meetingLink
        );
        if (existing) {
          router.push(`/meeting/${existing}`);
          return;
        }
        await handleStartMeeting(event);
        return;
      }

      const res = await joinMeeting(orgId, event._id);
      const roomId = extractRoomId(res.roomId || res.meetingLink);
      if (roomId) {
        router.push(`/meeting/${roomId}`);
      } else {
        showToast("Meeting room is not ready yet");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Unable to join meeting");
    }
  };

  const copyEventMeetingLink = async (event: CalendarEventAPI) => {
    const roomId = extractRoomId(
      event.meeting?.roomId || event.meeting?.meetingLink
    );
    if (!roomId) {
      showToast("Meeting link is not ready yet");
      return;
    }
    const url = `${window.location.origin}/meeting/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Meeting link copied");
    } catch {
      showToast(url);
    }
  };

  const handleSyncTasks = async () => {
    setSyncing(true);
    try {
      await syncTasksToCalendar(orgId);
      loadData(orgId, year, month, spaceFilter);
    } catch (e: any) {
      console.error("Sync failed:", e.message);
    } finally {
      setSyncing(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const selectedEvents = selectedDate ? (eventMap[selectedDate] || []) : [];
  const upcomingEvents = filteredEvents
    .filter(e => e.date >= todayKey)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 8);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-8 dark:bg-[#0B1120] dark:text-slate-100">

          {/* Toast */}
          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 text-slate-900 text-sm px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 pointer-events-none dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100">
              <Check size={14} className="text-cyan-400" /> {toast}
            </div>
          )}

          {/* API Error banner */}
          {apiError && (
            <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400">
              <AlertCircle size={16} className="shrink-0" />
              <span>{apiError}</span>
              <button onClick={() => loadData(orgId, year, month, spaceFilter)} className="ml-auto text-xs underline">Retry</button>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight dark:text-slate-100">Team Calendar</h1>
              <p className="text-slate-400 mt-1 text-sm dark:text-slate-500">Organization events &amp; reminders</p>
            </div>
            <div className="flex items-center gap-2.5">
              {/* My tasks toggle */}
              <button
                onClick={() => setMyTasksOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                  myTasksOnly ? "bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-500/10 dark:border-cyan-500/40 dark:text-cyan-400" : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <Users size={13} /> Mine only
              </button>
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  type="search"
                  className="bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 w-48 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                  placeholder="Search events…"
                  value={searchQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearchQuery(next);
                    const needle = next.trim().toLowerCase();
                    if (!needle) return;
                    const match = events.find((ev) => {
                      if (filterType === "high-priority" && ev.priority !== "high") return false;
                      if (filterType !== "all" && filterType !== "high-priority" && ev.type !== filterType) return false;
                      if (myTasksOnly && currentUserId.current) {
                        if (!ev.assignees.some((a) => a._id === currentUserId.current)) return false;
                      }
                      const haystack = [
                        ev.title,
                        ev.description,
                        ev.type,
                        ev.priority,
                        ev.space,
                        eventProjectName(ev),
                        ...(ev.assignees || []).map((a) => a.username),
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                      return haystack.includes(needle);
                    });
                    if (match?.date) setSelectedDate(match.date);
                  }}
                  aria-label="Search calendar events"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {searchNeedle && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {filteredEvents.length} match{filteredEvents.length === 1 ? "" : "es"}
                </span>
              )}
              {/* Type filter */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 dark:bg-slate-900 dark:border-slate-800">
                <Filter size={12} className="text-slate-400 dark:text-slate-500" />
                <Select
                  value={filterType}
                  onChange={(v) => setFilterType(v as EventType | "all" | "high-priority")}
                  options={[
                    { value: "all", label: "All types" },
                    { value: "task", label: "Tasks" },
                    { value: "meeting", label: "Meetings" },
                    { value: "reminder", label: "Reminders" },
                    { value: "high-priority", label: "High Priority" },
                  ]}
                  triggerClassName={(open) =>
                    `flex items-center gap-1.5 bg-transparent text-sm outline-none cursor-pointer transition-colors ${
                      open ? "text-cyan-600 dark:text-cyan-400" : "text-slate-600 dark:text-slate-300"
                    }`
                  }
                  menuClassName="min-w-[160px]"
                />
              </div>
              {/* Space filter */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 dark:bg-slate-900 dark:border-slate-800">
                <Briefcase size={12} className="text-slate-400 dark:text-slate-500" />
                <Select
                  value={spaceFilter}
                  onChange={setSpaceFilter}
                  options={SPACE_FILTER_OPTIONS}
                  triggerClassName={(open) =>
                    `flex items-center gap-1.5 bg-transparent text-sm outline-none cursor-pointer transition-colors ${
                      open ? "text-cyan-600 dark:text-cyan-400" : "text-slate-600 dark:text-slate-300"
                    }`
                  }
                  menuClassName="min-w-[160px]"
                />
              </div>
              {/* Sync tasks */}
              <button
                onClick={handleSyncTasks}
                disabled={syncing || !orgId}
                title="Sync tasks with due dates into calendar"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition disabled:opacity-40 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> Sync tasks
              </button>
              {/* Add event */}
              <button
                onClick={() => { setSelectedDate(null); setShowCreate(true); }}
                className="btn btn-primary btn-sm"
              >
                <Plus size={15} /> Add Event
              </button>
            </div>
          </div>

          {/* Stats row — icon tile placement (right side, vertically centered
              beside the label/count) matches the dashboard's stat cards.
              Order: Tasks, High Priority, Reminders, Meetings. */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {(() => {
              const t = "task" as const;
              const count = events.filter(e => e.type === t).length;
              const { Icon, iconBg, iconText } = STATS_ICON[t];
              return (
                <div
                  onClick={() => setFilterType(filterType === t ? "all" : t)}
                  className={`cursor-pointer rounded-xl p-4 border shadow-sm transition-all ${
                    filterType === t
                      ? `${typeStyle(t).bg} ${typeStyle(t).border} border`
                      : "bg-white border-slate-200 hover:border-cyan-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-cyan-500/40"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className={`text-2xl font-bold ${typeStyle(t).text}`}>{count}</div>
                      <div className="text-xs text-slate-500 capitalize mt-0.5 dark:text-slate-400">{t}s</div>
                    </div>
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className={iconText} size={20} />
                    </div>
                  </div>
                  <div className={`w-8 h-1 rounded-full mt-2 ${typeStyle(t).dot}`} />
                </div>
              );
            })()}
            {(() => {
              const count = events.filter(e => e.priority === "high").length;
              const active = filterType === "high-priority";
              return (
                <div
                  onClick={() => setFilterType(active ? "all" : "high-priority")}
                  className={`cursor-pointer rounded-xl p-4 border shadow-sm transition-all ${
                    active
                      ? "bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30"
                      : "bg-white border-slate-200 hover:border-cyan-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-cyan-500/40"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{count}</div>
                      <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">High Priority</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                      <Flame className="text-rose-600 dark:text-rose-400" size={20} />
                    </div>
                  </div>
                  <div className="w-8 h-1 rounded-full mt-2 bg-rose-400" />
                </div>
              );
            })()}
            {(["reminder","meeting"] as const).map(t => {
              const count = events.filter(e => e.type === t).length;
              const { Icon, iconBg, iconText } = STATS_ICON[t];
              return (
                <div
                  key={t}
                  onClick={() => setFilterType(filterType === t ? "all" : t)}
                  className={`cursor-pointer rounded-xl p-4 border shadow-sm transition-all ${
                    filterType === t
                      ? `${typeStyle(t).bg} ${typeStyle(t).border} border`
                      : "bg-white border-slate-200 hover:border-cyan-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-cyan-500/40"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className={`text-2xl font-bold ${typeStyle(t).text}`}>{count}</div>
                      <div className="text-xs text-slate-500 capitalize mt-0.5 dark:text-slate-400">{t}s</div>
                    </div>
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className={iconText} size={20} />
                    </div>
                  </div>
                  <div className={`w-8 h-1 rounded-full mt-2 ${typeStyle(t).dot}`} />
                </div>
              );
            })}
          </div>

          {/* Main grid */}
          <div className="grid xl:grid-cols-3 gap-5">

            {/* ── Calendar grid ── */}
            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 relative dark:bg-slate-900 dark:border-slate-800">
              {loading && (
                <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center z-10 dark:bg-slate-900/80">
                  <Loader2 size={28} className="animate-spin text-cyan-400" />
                </div>
              )}
              {/* Month nav */}
              <div className="flex items-center justify-between mb-5">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100"><ChevronLeft size={18} /></button>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{MONTHS[month]} {year}</h2>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100"><ChevronRight size={18} /></button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider py-1.5 dark:text-slate-500">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              {searchNeedle && filteredEvents.length === 0 && (
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  No events match &ldquo;{searchQuery.trim()}&rdquo; in this month. Try another keyword or clear search.
                </p>
              )}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} className="h-24 rounded-xl" />;
                  const key        = toKey(year, month, day);
                  const isToday    = key === todayKey;
                  const isSelected = key === selectedDate;
                  const dayEvents  = eventMap[key] || [];
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDate(isSelected ? null : key)}
                      className={`h-24 rounded-xl p-1.5 cursor-pointer transition-all flex flex-col gap-0.5 ${
                        isSelected ? "bg-cyan-500/15 ring-1 ring-cyan-500/50"
                        : isToday  ? "bg-slate-100 ring-1 ring-cyan-300 dark:bg-slate-800 dark:ring-cyan-500/40"
                        : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full self-start ${isToday ? "bg-cyan-400 text-[#020B2A]" : "text-slate-600 dark:text-slate-300"}`}>
                        {day}
                      </span>
                      <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                        {dayEvents.slice(0, 2).map(e => (
                          <div
                            key={e._id}
                            onClick={ev => { ev.stopPropagation(); setViewEvent(e); }}
                            className={`text-[10px] truncate px-1.5 py-0.5 rounded-md ${typeStyle(e.type).bg} ${typeStyle(e.type).text} font-medium cursor-pointer hover:opacity-80`}
                            title={eventProjectName(e) ? `${e.title} · ${eventProjectName(e)}` : e.title}
                          >
                            {e.meeting?.status === "live" && (
                              <span className="mr-0.5 text-emerald-600 dark:text-emerald-400">●</span>
                            )}
                            {e.taskRef && <span className="mr-0.5 opacity-60">◆</span>}
                            {e.title}
                            {eventProjectName(e) ? (
                              <span className="opacity-70 font-normal"> · {eventProjectName(e)}</span>
                            ) : null}
                          </div>
                        ))}
                        {dayEvents.length > 2 && <div className="text-[10px] text-slate-400 px-1 dark:text-slate-500">+{dayEvents.length - 2} more</div>}
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="flex -space-x-1 mt-auto">
                          {[...new Map(dayEvents.flatMap(e => e.assignees).map(u => [u._id, u])).values()].slice(0, 3).map(u => (
                            <div
                              key={u._id}
                              className={`w-3.5 h-3.5 ${avatarBg(u.avatarColor, u._id).className} rounded-full ring-1 ring-white dark:ring-slate-900`}
                              style={avatarBg(u.avatarColor, u._id).style}
                              title={u.username}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-5 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                {(Object.entries(TYPE_STYLES) as [EventType, { bg: string; text: string; dot: string; border: string }][]).map(([type, s]) => (
                  <div key={type} className="flex items-center gap-1.5 text-xs text-slate-500 capitalize dark:text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {type}
                    {type === "task" && <span className="text-[9px] text-slate-400 ml-0.5 dark:text-slate-500">(◆ = from task)</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right panel ── */}
            <div className="flex flex-col gap-4">

              {/* Selected day */}
              {selectedDate && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-slate-900 font-semibold text-sm dark:text-slate-100">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
                    </h3>
                    <button onClick={() => setShowCreate(true)} className="p-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 transition-colors dark:text-cyan-400">
                      <Plus size={12} />
                    </button>
                  </div>
                  {selectedEvents.length === 0 ? (
                    <p className="text-slate-400 text-xs dark:text-slate-500">No events. Click + to add one.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map(e => (
                        <div
                          key={e._id}
                          onClick={() => setViewEvent(e)}
                          className={`p-3 rounded-xl ${typeStyle(e.type).bg} border ${typeStyle(e.type).border} cursor-pointer hover:opacity-90 transition-opacity`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className={`font-semibold text-xs ${typeStyle(e.type).text} leading-tight`}>
                              {e.taskRef && <span className="mr-1 opacity-60">◆</span>}
                              {e.title}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              {e.meeting?.status === "live" && (
                                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                  Live
                                </span>
                              )}
                              <button onClick={ev => { ev.stopPropagation(); handleDelete(e._id); }} className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-red-400">
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                          {eventProjectName(e) && (
                            <p className="text-[10px] text-slate-500 truncate mb-2 dark:text-slate-400">
                              {eventProjectName(e)}
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400"><Clock size={9} />{e.time}</span>
                            <AvatarGroup users={e.assignees} max={3} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Org members panel */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-cyan-400" />
                    <h3 className="text-slate-900 font-semibold text-sm dark:text-slate-100">Organization — {members.length} members</h3>
                  </div>
                </div>
                {members.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Loading members…</p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {members.map(({ user, role, taskCount },index) => (
                      <div key={user._id || index} className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 ${avatarBg(user.avatarColor, user._id).className} rounded-full flex items-center justify-center text-[11px] text-white font-bold shrink-0 uppercase ring-2 ring-white dark:ring-slate-900`}
                          style={avatarBg(user.avatarColor, user._id).style}
                        >
                          {avatarInitials(user.username)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-900 text-xs font-medium truncate dark:text-slate-100">{user.username}</p>
                          <p className="text-slate-400 text-[10px] capitalize dark:text-slate-500">{user.designation || role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBreakdownMember(user);
                            setBreakdownYear(year);
                            setBreakdownMonth(month);
                          }}
                          title={`View ${user.username}'s assigned tasks`}
                          className="text-[10px] text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-1.5 py-0.5 rounded-full shrink-0 transition-colors dark:text-cyan-400 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20"
                        >
                          {taskCount ?? 0}
                        </button>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          user.status === "Active" ? "bg-emerald-400"
                          : user.status === "Idle" ? "bg-yellow-400"
                          : "bg-slate-400"
                        }`} title={user.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming events */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex-1 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <CalIcon size={14} className="text-cyan-400" />
                  <h3 className="text-slate-900 font-semibold text-sm dark:text-slate-100">Upcoming</h3>
                </div>
                {upcomingEvents.length === 0 ? (
                  <p className="text-slate-400 text-xs dark:text-slate-500">No upcoming events.</p>
                ) : (
                  <div className="space-y-2.5">
                    {upcomingEvents.map(e => (
                      <div
                        key={e._id}
                        onClick={() => setViewEvent(e)}
                        className="flex items-center gap-3 border-b border-slate-200 pb-2.5 last:border-0 last:pb-0 cursor-pointer hover:opacity-80 transition-opacity group dark:border-slate-800"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${typeStyle(e.type).dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-900 text-xs font-medium truncate dark:text-slate-100">{e.title}</p>
                          {eventProjectName(e) && (
                            <p className="text-[10px] text-slate-500 truncate dark:text-slate-400">
                              {eventProjectName(e)}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-slate-400 text-[10px] dark:text-slate-500">
                              {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" })} · {e.time}
                            </p>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[e.priority].bg} ${PRIORITY_STYLES[e.priority].text}`}>
                              {e.priority}
                            </span>
                          </div>
                          {e.assignees.length > 0 && (
                            <p className="text-slate-500 text-[10px] mt-0.5 truncate dark:text-slate-400">
                              {e.assignees.map(a => a.username).join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          <AvatarGroup users={e.assignees} max={2} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <Modal title="Add Event" onClose={() => closeEventForm(() => setShowCreate(false))}>
          <EventForm
            defaultDate={selectedDate || undefined}
            members={members}
            projects={projects}
            orgId={orgId}
            onSave={handleCreate}
            onCancel={() => closeEventForm(() => setShowCreate(false))}
            onDirtyChange={setEventFormDirty}
            saving={saving}
          />
        </Modal>
      )}

      {editEvent && (
        <Modal title="Edit Event" onClose={() => closeEventForm(() => setEditEvent(null))}>
          <EventForm
            initial={editEvent}
            members={members}
            projects={projects}
            orgId={orgId}
            onSave={handleEdit}
            onCancel={() => closeEventForm(() => setEditEvent(null))}
            onDirtyChange={setEventFormDirty}
            saving={saving}
          />
        </Modal>
      )}

      {breakdownMember && (() => {
        const meetings = breakdownEvents.filter((e) => e.type === "meeting");
        const reminders = breakdownEvents.filter((e) => e.type === "reminder");
        const highPriorityTasks = breakdownTasks.filter((t) => t.priority === "high");
        const goToBreakdownMonth = (delta: number) => {
          const next = new Date(breakdownYear, breakdownMonth + delta, 1);
          setBreakdownYear(next.getFullYear());
          setBreakdownMonth(next.getMonth());
        };
        const openAssignedTask = (task: MemberAssignedTask) => {
          if (!task.project?._id) return;
          setBreakdownMember(null);
          router.push(`/projects/${task.project._id}?task=${task._id}`);
        };
        return (
          <Modal title={`${breakdownMember.username}'s items`} onClose={() => setBreakdownMember(null)}>
            <div className="space-y-4">
              {breakdownLoading ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${STATS_ICON.task.iconBg}`}>
                        <ClipboardList size={13} className={STATS_ICON.task.iconText} />
                      </div>
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Tasks{" "}
                        <span className="text-slate-400 dark:text-slate-500">
                          ({breakdownTasks.length})
                        </span>
                      </h4>
                    </div>
                    {breakdownTasks.length === 0 ? (
                      <p className="text-xs text-slate-400 pl-8 dark:text-slate-500">
                        No tasks assigned.
                      </p>
                    ) : (
                      <ul className="space-y-1 pl-8 max-h-56 overflow-y-auto pr-1">
                        {breakdownTasks.map((task) => (
                          <li
                            key={task._id}
                            onClick={() => openAssignedTask(task)}
                            className="text-xs text-slate-600 cursor-pointer hover:text-cyan-700 transition-colors dark:text-slate-300 dark:hover:text-cyan-400"
                          >
                            <span className="font-medium truncate block">{task.title}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {task.project?.title ? `${task.project.title} · ` : ""}
                              {task.dueDate
                                ? new Date(task.dueDate + "T12:00:00").toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "No due date"}
                              {" · "}
                              <span className="capitalize">{task.status.replace(/-/g, " ")}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-rose-100 dark:bg-rose-500/10">
                        <Flame size={13} className="text-rose-600 dark:text-rose-400" />
                      </div>
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        High priority tasks{" "}
                        <span className="text-slate-400 dark:text-slate-500">
                          ({highPriorityTasks.length})
                        </span>
                      </h4>
                    </div>
                    {highPriorityTasks.length === 0 ? (
                      <p className="text-xs text-slate-400 pl-8 dark:text-slate-500">None</p>
                    ) : (
                      <ul className="space-y-1 pl-8">
                        {highPriorityTasks.map((task) => (
                          <li
                            key={`hi-${task._id}`}
                            onClick={() => openAssignedTask(task)}
                            className="text-xs text-slate-600 truncate cursor-pointer hover:text-cyan-700 transition-colors dark:text-slate-300 dark:hover:text-cyan-400"
                          >
                            {task.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {[
                    { key: "meetings", label: "Meetings", items: meetings, ...STATS_ICON.meeting },
                    { key: "reminders", label: "Reminders", items: reminders, ...STATS_ICON.reminder },
                  ].map(({ key, label, items, Icon, iconBg, iconText }) => (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                          <Icon size={13} className={iconText} />
                        </div>
                        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {label}{" "}
                          <span className="text-slate-400 dark:text-slate-500">
                            ({items.length}) · {MONTHS[breakdownMonth]} {breakdownYear}
                          </span>
                        </h4>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-slate-400 pl-8 dark:text-slate-500">None</p>
                      ) : (
                        <ul className="space-y-1 pl-8">
                          {items.map((e) => (
                            <li
                              key={e._id}
                              onClick={() => {
                                setBreakdownMember(null);
                                setViewEvent(e);
                              }}
                              className="text-xs text-slate-600 truncate cursor-pointer hover:text-cyan-700 transition-colors dark:text-slate-300 dark:hover:text-cyan-400"
                            >
                              {e.title}{" "}
                              <span className="text-slate-400 dark:text-slate-500">
                                ·{" "}
                                {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => goToBreakdownMonth(-1)}
                  disabled={breakdownLoading}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-cyan-700 transition-colors disabled:opacity-40 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ChevronLeft size={14} />
                  Previous month
                </button>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Meetings / reminders: {MONTHS[breakdownMonth]} {breakdownYear}
                </span>
                <button
                  type="button"
                  onClick={() => goToBreakdownMonth(1)}
                  disabled={breakdownLoading}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-cyan-700 transition-colors disabled:opacity-40 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  Upcoming month
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Event detail */}
      {viewEvent && !editEvent && (
        <Modal title={viewEvent.title} onClose={() => setViewEvent(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${typeStyle(viewEvent.type).bg} ${typeStyle(viewEvent.type).text}`}>
                {viewEvent.type}
              </span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${PRIORITY_STYLES[viewEvent.priority].bg} ${PRIORITY_STYLES[viewEvent.priority].text}`}>
                {viewEvent.priority} priority
              </span>
              {eventProjectName(viewEvent) && (
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1 dark:bg-slate-800 dark:text-slate-300">
                  <Briefcase size={10} /> {eventProjectName(viewEvent)}
                </span>
              )}
              <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1 dark:bg-slate-800 dark:text-slate-400">
                <Briefcase size={10} /> {viewEvent.space}
              </span>
              {isCurrentUserCreator ? (
                <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  You own this
                </span>
              ) : (
                <span className="text-xs px-3 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400">
                  Assigned to you
                </span>
              )}
              {viewEvent.meeting?.status === "live" && (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  ● Live
                </span>
              )}
              {viewEvent.taskRef && (
                <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">◆ Linked task</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Clock size={14} className="text-cyan-400" />
              {new Date(viewEvent.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })} at {viewEvent.time}
            </div>

            {viewEvent.createdBy && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Created by:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {typeof viewEvent.createdBy === "string"
                    ? viewEvent.createdBy
                    : viewEvent.createdBy.username}
                </span>
              </p>
            )}

            {viewEvent.description && (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed dark:text-slate-400 dark:bg-slate-800">{viewEvent.description}</p>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 dark:text-slate-400">
                Assignees ({viewEvent.assignees.length})
              </p>
              {viewEvent.assignees.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">No assignees</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {viewEvent.assignees.map(u => (
                    <div key={u._id} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 dark:bg-slate-800">
                      <div
                        className={`w-6 h-6 ${avatarBg(u.avatarColor, u._id).className} rounded-full flex items-center justify-center text-[10px] text-white font-bold uppercase`}
                        style={avatarBg(u.avatarColor, u._id).style}
                      >
                        {avatarInitials(u.username)}
                      </div>
                      <div>
                        <p className="text-xs text-slate-900 dark:text-slate-100">{u.username}</p>
                        {u.designation && <p className="text-[10px] text-slate-400 dark:text-slate-500">{u.designation}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
  {viewEvent.type === "meeting" &&
    isCurrentUserCreator &&
    meetingStatus !== "live" &&
    meetingStatus !== "ended" && (
      <button
        onClick={() => handleStartMeeting(viewEvent)}
        className="btn btn-success flex-1"
      >
        ▶ Start Meeting
      </button>
    )}

  {viewEvent.type === "meeting" &&
    isCurrentUserCreator &&
    meetingStatus === "live" && (
      <button
        onClick={() => handleJoinMeeting(viewEvent)}
        className="btn btn-success flex-1"
      >
        Enter Room
      </button>
    )}

  {viewEvent.type === "meeting" &&
    !isCurrentUserCreator &&
    isMeetingAssignee &&
    meetingStatus === "live" && (
      <button
        onClick={() => handleJoinMeeting(viewEvent)}
        className="btn btn-primary flex-1"
      >
        Join Meeting
      </button>
    )}

  {viewEvent.type === "meeting" &&
    !isCurrentUserCreator &&
    isMeetingAssignee &&
    meetingStatus !== "live" && (
      <button
        type="button"
        disabled
        className="btn btn-secondary flex-1 opacity-60 cursor-not-allowed"
      >
        {meetingStatus === "ended" ? "Meeting ended" : "Waiting for host"}
      </button>
    )}

  {viewEvent.type === "meeting" && viewEvent.meeting?.roomId && (
    <button
      type="button"
      onClick={() => copyEventMeetingLink(viewEvent)}
      className="btn btn-secondary flex-1"
    >
      Copy link
    </button>
  )}
  {isCurrentUserCreator && (
    <button
      onClick={() => {
        setViewEvent(null);
        setEditEvent(viewEvent);
      }}
      className="btn btn-secondary flex-1"
    >
      Edit
    </button>
  )}

  {isCurrentUserCreator && (
    <button
      onClick={() => handleDelete(viewEvent._id)}
      className="btn btn-danger flex-1"
    >
      Delete
    </button>
  )}

</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
