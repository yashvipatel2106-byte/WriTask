"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, UserPlus, X } from "lucide-react";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";

type Member = {
  user: { _id: string; username: string; email?: string; avatarColor?: string };
  role?: string;
};

type Props = {
  members: Member[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Bump this (e.g. n => n + 1) to force the picker open from outside — e.g. a
   * quick-glance chip elsewhere in the page that should jump straight into it. */
  openSignal?: number;
  /** Initials-only chips and an icon-only add button — for tight spaces like
   * an inline header row, instead of the full name + labeled button. */
  compact?: boolean;
  /** User ids with an approved leave covering the task's current due date —
   * shown with an "On Leave" badge and blocked from being added. Best-effort
   * UX; the backend still hard-blocks the actual assignment either way. */
  onLeaveUserIds?: Set<string>;
};

export default function AssigneePicker({
  members,
  selectedIds,
  onChange,
  disabled = false,
  placeholder = "Add assignees",
  openSignal = 0,
  compact = false,
  onLeaveUserIds,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openSignal > 0 && !disabled) setOpen(true);
  }, [openSignal, disabled]);

  const selectedMembers = useMemo(
    () =>
      selectedIds
        .map((id) => members.find((m) => m.user._id === id))
        .filter((m): m is Member => Boolean(m)),
    [members, selectedIds]
  );

  const availableMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      if (selectedIds.includes(member.user._id)) return false;
      if (!q) return true;
      const haystack = `${member.user.username} ${member.user.email || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query, selectedIds]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const removeAssignee = (id: string) => {
    if (disabled) return;
    onChange(selectedIds.filter((row) => row !== id));
  };

  const addAssignee = (id: string) => {
    if (disabled || selectedIds.includes(id) || onLeaveUserIds?.has(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
  };

  if (members.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">No project members available</p>;
  }

  return (
    <div ref={rootRef} className="relative">
      <div className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-2"} min-h-[2.25rem]`}>
        {selectedMembers.length === 0 && !compact ? (
          <span className="text-sm text-slate-400 dark:text-slate-500">Unassigned</span>
        ) : (
          selectedMembers.map((member) =>
            compact ? (
              <span
                key={member.user._id}
                className="group relative shrink-0"
                title={member.user.username}
              >
                <span
                  className={`w-6 h-6 rounded-full ${avatarBg(member.user.avatarColor, member.user._id || member.user.username).className} flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900`}
                  style={avatarBg(member.user.avatarColor, member.user._id || member.user.username).style}
                >
                  {avatarInitials(member.user.username)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAssignee(member.user._id)}
                    className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-700 text-white group-hover:flex dark:bg-slate-600"
                    title="Remove assignee"
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ) : (
              <span
                key={member.user._id}
                className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs dark:bg-cyan-400/10 dark:border-cyan-400/20 dark:text-cyan-300"
              >
                <span
                  className={`w-6 h-6 rounded-full ${avatarBg(member.user.avatarColor, member.user._id || member.user.username).className} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
                  style={avatarBg(member.user.avatarColor, member.user._id || member.user.username).style}
                >
                  {avatarInitials(member.user.username)}
                </span>
                <span className="max-w-[140px] truncate">{member.user.username}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAssignee(member.user._id)}
                    className="p-0.5 rounded-full hover:bg-cyan-100 text-cyan-600 hover:text-cyan-900 dark:hover:bg-cyan-400/20 dark:text-cyan-400 dark:hover:text-cyan-300"
                    title="Remove assignee"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            )
          )
        )}

        {!disabled &&
          (compact ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50 transition dark:border-slate-600 dark:text-slate-500 dark:hover:border-cyan-500 dark:hover:text-cyan-400 dark:hover:bg-cyan-400/10"
              title={placeholder}
            >
              <Plus size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-slate-300 text-xs text-slate-500 hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50 transition dark:border-slate-700 dark:text-slate-400 dark:hover:border-cyan-500 dark:hover:text-cyan-400 dark:hover:bg-cyan-400/10"
            >
              {selectedMembers.length === 0 ? (
                <UserPlus size={13} />
              ) : (
                <Plus size={13} />
              )}
              {placeholder}
            </button>
          ))}
      </div>

      {open && !disabled && (
        <div
          className={`absolute z-20 mt-2 w-full min-w-[260px] max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 ${
            compact ? "right-0" : ""
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            <Search size={14} className="text-slate-400 shrink-0 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {availableMembers.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
                {query.trim()
                  ? "No matching members"
                  : "Everyone is already assigned"}
              </li>
            ) : (
              availableMembers.map((member) => {
                const onLeave = onLeaveUserIds?.has(member.user._id) ?? false;
                return (
                  <li key={member.user._id}>
                    <button
                      type="button"
                      disabled={onLeave}
                      onClick={() => addAssignee(member.user._id)}
                      title={onLeave ? "On approved leave for this date" : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition ${
                        onLeave
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-cyan-50 dark:hover:bg-cyan-400/10"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full ${avatarBg(member.user.avatarColor, member.user._id || member.user.username).className} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
                        style={avatarBg(member.user.avatarColor, member.user._id || member.user.username).style}
                      >
                        {avatarInitials(member.user.username)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm text-slate-800 truncate dark:text-slate-100">
                          {member.user.username}
                          {onLeave && (
                            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                              🟠 On Leave
                            </span>
                          )}
                        </span>
                        {member.user.email && (
                          <span className="block text-[11px] text-slate-400 truncate dark:text-slate-500">
                            {member.user.email}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function assigneeIdsFromTask(task: {
  assignees?: Array<{ _id: string } | string>;
  assignee?: { _id: string } | null;
}) {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.map((entry) =>
      typeof entry === "object" && entry._id ? entry._id : String(entry)
    );
  }
  return task.assignee?._id ? [task.assignee._id] : [];
}

export function assigneeLabelsFromTask(task: {
  assignees?: Array<{ username?: string }>;
  assignee?: { username?: string } | null;
}) {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees
      .map((entry) => entry.username)
      .filter(Boolean)
      .join(", ");
  }
  return task.assignee?.username || "";
}
