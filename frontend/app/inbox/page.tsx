"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/components/context/organizationContext";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { authFetch } from "@/lib/validation/authFetch";
import {
  archiveNotification,
  actorName,
  fetchNotificationSummary,
  fetchNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_TYPE_LABELS,
  priorityClass,
  type NotificationItem,
  type NotificationType,
  typeBadgeClass,
} from "@/lib/notifications";
import {
  collectMentionIds,
  normalizeMentionMembers,
  splitMentionTokens,
  type MentionMember,
} from "@/lib/mentions";
import { Archive, Check, CheckCheck, ChevronDown, ExternalLink } from "lucide-react";
import { avatarBg } from "@/lib/avatarColor";

function MessageBody({ text }: { text: string }) {
  const tokens = splitMentionTokens(text);
  return (
    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap dark:text-slate-200">
      {tokens.map((token, index) =>
        token.kind === "mention" ? (
          <span key={index} className="text-cyan-700 font-medium dark:text-cyan-400">
            {token.value}
          </span>
        ) : (
          <span key={index}>{token.value}</span>
        )
      )}
    </p>
  );
}

function formatArrivalDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "assignment", label: "Assignments" },
  { value: "mention", label: "Mentions" },
  { value: "comment", label: "Comments" },
  { value: "status", label: "Status" },
  { value: "reply", label: "Replies" },
  { value: "leave_requested,leave_approved,leave_rejected", label: "Leave" },
  { value: "reminder", label: "Reminder" },
];


function FilterDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx < 0 ? 0 : idx);
    }
  }, [open, value, options]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) commit(options[activeIndex].value);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-4 pr-3 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20"
      >
        <span>{selected?.label}</span>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-2 w-48 origin-top rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/60 animate-[fadeIn_120ms_ease-out] dark:border-slate-800 dark:bg-slate-900"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span className={isSelected ? "font-semibold" : ""}>
                  {option.label}
                </span>
                {isSelected && <Check size={15} className="text-cyan-600 dark:text-cyan-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const { currentOrgId } = useOrganization();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showHighPriorityOnly, setShowHighPriorityOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [projectMembers, setProjectMembers] = useState<MentionMember[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Members matching what's typed after "@"
  const mentionMatches = projectMembers.filter((m) =>
    m.user.username.toLowerCase().startsWith(mentionQuery.toLowerCase())
  );

  // Detect an active "@token" immediately before the caret
  const detectMention = (value: string, caret: number) => {
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/(?:^|\s)@([A-Za-z0-9_.-]*)$/);
    if (!match) return null;
    return { query: match[1], start: caret - match[1].length - 1 };
  };

  const handleReplyChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = e.target.value;
    setReply(value);
    const caret = e.target.selectionStart ?? value.length;
    const found = detectMention(value, caret);
    if (found) {
      setMentionOpen(true);
      setMentionQuery(found.query);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const insertMention = (member: MentionMember) => {
    const el = replyRef.current;
    const caret = el?.selectionStart ?? reply.length;
    const found = detectMention(reply, caret);
    const start = found ? found.start : caret;
    const before = reply.slice(0, start);
    const after = reply.slice(caret);
    const token = `@${member.user.username} `;
    const next = before + token + after;
    setReply(next);
    setMentionOpen(false);
    setMentionQuery("");
    // restore caret just after the inserted mention
    requestAnimationFrame(() => {
      const pos = (before + token).length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const handleReplyKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (!mentionOpen || mentionMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionMatches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex(
        (i) => (i - 1 + mentionMatches.length) % mentionMatches.length
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(mentionMatches[mentionIndex]);
    } else if (e.key === "Escape") {
      setMentionOpen(false);
    }
  };

  const loadProjectMembers = useCallback(async (projectId: string) => {
    const res = await authFetch(`/projects/${projectId}/members`);
    if (res.ok) {
      setProjectMembers(normalizeMentionMembers(await res.json()));
      return;
    }
    setProjectMembers([]);
  }, []);

  useEffect(() => {
    if (!selected?.projectId) {
      setProjectMembers([]);
      return;
    }
    loadProjectMembers(selected.projectId);
  }, [selected?.projectId, loadProjectMembers]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const scope = currentOrgId
        ? { organizationId: currentOrgId }
        : { personal: true };

      const [data, summary] = await Promise.all([
        fetchNotifications({
          limit: 100,
          unread: showUnreadOnly,
          type: filterType,
          search: searchTerm,
          ...scope,
        }),
        fetchNotificationSummary(scope),
      ]);
      setItems(data);
      setUnreadCount(summary.unreadCount ?? 0);
      setSelected((current) => {
        if (!current) return data[0] || null;
        return data.find((item) => item._id === current._id) || data[0] || null;
      });
    } finally {
      setLoading(false);
    }
  }, [showUnreadOnly, filterType, searchTerm, currentOrgId]);

  useEffect(() => {
    loadItems();
    const onWorkspaceChange = () => void loadItems();
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [loadItems]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (showHighPriorityOnly && item.priority !== "High") return false;
      return true;
    });
  }, [items, showHighPriorityOnly]);

  const openItem = async (item: NotificationItem) => {
    setSelected(item);
    if (!item.read) {
      const res = await markNotificationRead(item._id);
      if (res.ok) {
        const updated = await res.json();
        // In the "Unread" filtered view, a now-read item no longer belongs —
        // drop it from the list instead of just re-styling it in place.
        setItems((prev) =>
          showUnreadOnly
            ? prev.filter((row) => row._id !== updated._id)
            : prev.map((row) => (row._id === updated._id ? updated : row))
        );
        setSelected(updated);
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const handleMarkAllRead = async () => {
    const res = await markAllNotificationsRead();
    if (res.ok) {
      if (showUnreadOnly) {
        setItems([]);
        setSelected(null);
      } else {
        setItems((prev) => prev.map((item) => ({ ...item, read: true })));
        if (selected) setSelected({ ...selected, read: true });
      }
      setUnreadCount(0);
    }
  };

  const handleArchive = async () => {
    if (!selected) return;
    const res = await archiveNotification(selected._id);
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item._id !== selected._id));
      setSelected(null);
      if (!selected.read) setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;

    setSending(true);
    try {
      if (selected.projectId && selected.taskId) {
        const mentionIds = collectMentionIds(reply.trim(), projectMembers);
        const res = await authFetch(
          `/projects/${selected.projectId}/tasks/${selected.taskId}/comments`,
          {
            method: "POST",
            body: JSON.stringify({
              body: reply.trim(),
              mentions: mentionIds,
            }),
          }
        );
        if (res.ok) {
          setReply("");
          await loadItems();
          return;
        }
      }

      const res = await authFetch("/notifications", {
        method: "POST",
        body: JSON.stringify({
          title: `Re: ${selected.title}`,
          message: reply.trim(),
          type: "reply",
          taskId: selected.taskId || null,
          projectId: selected.projectId || null,
          link: selected.link || "",
          priority: selected.priority || "Medium",
        }),
      });

      if (res.ok) {
        setReply("");
        await loadItems();
      }
    } finally {
      setSending(false);
    }
  };

  const openLinkedResource = () => {
    if (!selected?.link) return;
    router.push(selected.link);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-7">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Inbox</h1>
              <p className="text-slate-500 mt-1 dark:text-slate-400">
                Full message queue — read, filter, reply, and archive
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <CheckCheck size={15} />
                Mark all read
              </button>
              <div className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                {unreadCount} unread
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <input
              type="text"
              placeholder="Search Messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-80 field-input rounded-2xl shadow-sm"
            />
            <FilterDropdown
              value={filterType}
              options={TYPE_FILTERS}
              onChange={setFilterType}
            />
            <button
              type="button"
              onClick={() => setShowUnreadOnly((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showUnreadOnly
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Unread
            </button>
            <button
              type="button"
              onClick={() => setShowHighPriorityOnly((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showHighPriorityOnly
                  ? "bg-red-500 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              High priority
            </button>
          </div>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
              <div className="border-b border-slate-100 p-5 text-lg font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">
                Messages
              </div>
              <div className="max-h-[620px] overflow-y-auto p-3 space-y-2">
                {loading ? (
                  <p className="text-center text-slate-400 py-10 text-sm dark:text-slate-500">
                    Loading…
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="text-center text-slate-400 py-10 text-sm dark:text-slate-500">
                    No notifications match your filters
                  </p>
                ) : (
                  filtered.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => openItem(item)}
                      className={`w-full text-left rounded-xl p-4 border transition-all ${
                        selected?._id === item._id
                          ? "border-cyan-300 bg-cyan-50 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-500/10"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex justify-between gap-2 mb-1">
                        <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {actorName(item)}
                        </span>
                        {!item.read && (
                          <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                        {item.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${typeBadgeClass(item.type)}`}
                        >
                          {NOTIFICATION_TYPE_LABELS[item.type as NotificationType]}
                        </span>
                        <span
                          className={`text-[10px] ${priorityClass(item.priority)}`}
                        >
                          {item.priority || "Medium"}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto dark:text-slate-500">
                          {formatArrivalDate(item.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm min-h-[500px] flex flex-col dark:bg-slate-900 dark:border-slate-800">
              {selected ? (
                <>
                  <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between gap-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selected.title}</h2>
                      <p className="text-slate-500 mt-1 dark:text-slate-400">
                        From {actorName(selected)} ·{" "}
                        {formatArrivalDate(selected.createdAt)} ·{" "}
                        {formatNotificationTime(selected.createdAt)}
                      </p>
                      <span
                        className={`inline-block text-xs px-2 py-2 lg:pt-3 rounded-full ${typeBadgeClass(selected.type)}`}
                      >
                        {NOTIFICATION_TYPE_LABELS[selected.type]}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {selected.link && (
                        <button
                          type="button"
                          onClick={openLinkedResource}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-cyan-700 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                        >
                          <ExternalLink size={14} />
                          Open task
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleArchive}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    </div>
                  </div>

                  <div className="p-6 flex-1">
                    <MessageBody text={selected.message} />

                    <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
                      <h3 className="font-semibold text-slate-800 mb-3 dark:text-slate-100">Reply</h3>
                      <div className="relative">
                        <textarea
                          ref={replyRef}
                          rows={4}
                          value={reply}
                          onChange={handleReplyChange}
                          onKeyDown={handleReplyKeyDown}
                          onBlur={() =>
                            setTimeout(() => setMentionOpen(false), 120)
                          }
                          placeholder={
                            selected.taskId
                              ? "Reply as a task comment… use @username to mention"
                              : "Write a reply…"
                          }
                          className="w-full border border-slate-200 bg-slate-50 rounded-xl p-4 outline-none text-sm text-slate-800 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20"
                        />

                        {mentionOpen && mentionMatches.length > 0 && (
                          <div className="absolute left-3 top-full z-30 mt-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Mention a member
                            </p>
                            {mentionMatches.map((m, i) => {
                              const active = i === mentionIndex;
                              const name = m.user.username;
                              return (
                                <button
                                  key={m.user._id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertMention(m);
                                  }}
                                  onMouseEnter={() => setMentionIndex(i)}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                    active
                                      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
                                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  <span
                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                                      avatarBg(m.user.avatarColor, m.user._id).className
                                    }`}
                                    style={avatarBg(m.user.avatarColor, m.user._id).style}
                                  >
                                    {name.charAt(0).toUpperCase()}
                                  </span>
                                  <span className="truncate">{name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={!reply.trim() || sending}
                        className="btn btn-primary mt-3"
                      >
                        {sending ? "Sending…" : "Send reply"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 p-10 text-center dark:text-slate-500">
                  <div>
                    <p>Select a notification from the list</p>
                    <p className="text-xs mt-2 text-slate-400 dark:text-slate-500">
                      Use the bell in the navbar for quick alerts — open Inbox
                      here for the full queue.
                    </p>
                    <Link
                      href="/inbox"
                      className="text-cyan-700 text-sm mt-3 inline-block hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
                    >
                      Refresh inbox
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
