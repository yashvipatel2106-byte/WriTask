"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import DOMPurify from "dompurify";
import { authFetch } from "@/lib/validation/authFetch";
import { apiUrl } from "@/lib/validation/api";
import type { TaskItem, TaskAttachment } from "./KanbanBoard";
import { buildStatusOptions } from "@/lib/taskStatuses";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import { PRIORITY_OPTIONS } from "@/lib/constants/taskPriority";
import { ModalShell } from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { confirmDialog } from "@/components/ui/confirm";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import JoditDescriptionEditor from "./JoditDescriptionEditor";
import {
  X,
  Paperclip,
  Download,
  Eye,
  Trash2,
  Calendar,
  Send,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Clock,
  UserPlus,
  Flag,
  CheckSquare,
  PlusCircle,
  MessageSquare,
  ChevronRight,
  Copy,
  Link2,
  CornerDownLeft,
  FileText,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import {
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
} from "date-fns";
import WorkingDaysDialog from "./WorkingDaysDialog";
import { buildTaskUrl } from "@/lib/taskUrls";
import AssigneePicker, {
  assigneeIdsFromTask,
  assigneeLabelsFromTask,
} from "./AssigneePicker";
import { useOrganization } from "@/components/context/organizationContext";
import { fetchUsersOnLeave } from "@/lib/validation/leaveApi";
import { toast } from "@/components/ui/toast";
import {
  dueDateFromDuration,
  formatWorkingDaysSummary,
  isDefaultWorkingDays,
  isWorkingDay,
  normalizeWorkingDays,
  workingDaysBetween,
  DEFAULT_WORKING_DAYS,
} from "@/lib/workingDays";

const DEFAULT_STATUS_OPTIONS = buildStatusOptions();

function getAttachmentPreviewKind(
  mimeType?: string,
  originalName?: string
): "image" | "pdf" | null {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  const name = (originalName || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return null;
}

type MemberOption = {
  user: { _id: string; username: string; email: string };
  role: string;
};

type CommentAttachment = {
  attachmentId?: string;
  originalName: string;
  size?: number;
};

type TaskActivityUser = {
  _id: string;
  username?: string;
  email?: string;
  avatarColor?: string;
};

type TaskActivityComment = {
  id: string;
  source: "comment";
  body: string;
  author: TaskActivityUser | null;
  mentions?: TaskActivityUser[];
  attachments?: CommentAttachment[];
  createdAt: string;
  editedAt?: string | null;
};

type TaskActivityEvent = {
  id: string;
  source: "event";
  kind: string;
  action: string;
  message: string;
  actor: TaskActivityUser | null;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
};

type TaskActivityItem = TaskActivityComment | TaskActivityEvent;

const COMMENT_EDIT_WINDOW_MS = 2 * 60 * 1000;
// Subtasks nest via parentSubtaskId (self-reference within the flat
// `subtasks` array) — a subtask with no parent is level 1. Mirrors
// MAX_SUBTASK_LEVEL in the backend's taskController.
const MAX_SUBTASK_LEVEL = 3;

type TaskComment = {
  _id: string;
  body: string;
  createdAt: string;
  author?: { _id: string; username: string; email?: string; avatarColor?: string };
  mentions?: Array<{ _id: string; username: string }>;
  attachments?: CommentAttachment[];
};

type SubtaskItem = {
  _id: string;
  title: string;
  description?: string;
  status?: string;
  completed: boolean;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  effortHours?: number | null;
  durationHours?: number | null;
  workingDays?: number[] | null;
  // Self-reference to another subtask's _id in the same flat `subtasks`
  // array — lets a subtask have its own nested subtasks, up to 3 levels.
  parentSubtaskId?: string | null;
  assignee?: { _id: string; username: string; email?: string } | null;
  assignees?: Array<{ _id: string; username: string; email?: string }>;
};

export type TaskTab = "details" | "subtasks" | "attachments" | "activity";

type Props = {
  task: TaskItem & {
    durationHours?: number | null;
    effortHours?: number | null;
    workingDays?: number[] | null;
    subtasks?: SubtaskItem[];
    assignees?: Array<{ _id: string; username: string; email?: string }>;
  };
  projectId: string;
  canEdit: boolean;
  statusOptions?: Array<{ value: string; label: string }>;
  activeSubtaskId?: string | null;
  onSubtaskOpen?: (subtaskId: string) => void;
  onNavigateParent?: () => void;
  onClose: () => void;
  onUpdated: (task: TaskItem) => void;
  onDeleted: (taskId: string) => void;
  /** Tab to open on first render — e.g. jump straight to Activity from a mention/comment notification. */
  initialTab?: TaskTab;
  /** When provided, shows a "Restore" button in the footer (e.g. viewing a
   * trashed task read-only from the Trash bin) — independent of canEdit,
   * since restoring isn't a normal edit action. */
  onRestore?: () => void;
  restoring?: boolean;
};

function toDateKey(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function parseDateKey(value: string) {
  return parseISO(`${value}T12:00:00`);
}

function formatCalendarDate(value: string) {
  if (!value) return "Not set";
  return format(parseDateKey(value), "EEE, MMM d, yyyy");
}

function formatTableDate(value?: string | null) {
  if (!value) return "—";
  return format(parseDateKey(toDateKey(value)), "MMM d, yyyy");
}

function isUserMentionedInText(text: string, username: string) {
  if (!text.trim() || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}(?![\\w])`, "i").test(text);
}

function resolveSubtaskStatus(subtask: SubtaskItem) {
  return subtask.status || (subtask.completed ? "completed" : "todo");
}

function isSubtaskDone(subtask: SubtaskItem) {
  return subtask.completed || resolveSubtaskStatus(subtask) === "completed";
}

function statusPillClasses(statusId: string) {
  const map: Record<string, { pill: string; bar: string }> = {
    todo: {
      pill: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      bar: "bg-slate-400",
    },
    "in-progress": {
      pill: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-400/20",
      bar: "bg-cyan-400",
    },
    review: {
      pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
      bar: "bg-amber-400",
    },
    completed: {
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
      bar: "bg-emerald-400",
    },
  };
  return (
    map[statusId] || {
      pill: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
      bar: "bg-violet-400",
    }
  );
}

function priorityPillClasses(priorityId: string) {
  const map: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    low: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  return (
    map[priorityId] ||
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  );
}

type ParsedDuration = {
  days: number;
  hours: number;
  totalHours: number;
};

function parseDurationInput(raw: string): ParsedDuration | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const combo =
    trimmed.match(/^(\d+)\s*days?\s+(\d+)\s*(?:hours?|h)$/) ||
    trimmed.match(/^(\d+)\s*d\s+(\d+)\s*h$/) ||
    trimmed.match(/^(\d+)\s+(\d+)\s*h$/);

  if (combo) {
    const days = Number(combo[1]);
    const hours = Number(combo[2]);
    if (
      Number.isNaN(days) ||
      Number.isNaN(hours) ||
      days < 0 ||
      hours < 0 ||
      hours >= 24
    ) {
      return null;
    }
    return { days, hours, totalHours: days * 24 + hours };
  }

  const hoursOnly = trimmed.match(/^(\d+)\s*(?:hours?|h)$/);
  if (hoursOnly) {
    const hours = Number(hoursOnly[1]);
    if (Number.isNaN(hours) || hours < 0) return null;
    return { days: 0, hours, totalHours: hours };
  }

  const daysOnly = trimmed.match(/^(\d+)\s*(?:days?|d)?$/);
  if (daysOnly) {
    const days = Number(daysOnly[1]);
    if (Number.isNaN(days) || days < 0) return null;
    return { days, hours: 0, totalHours: days * 24 };
  }

  return null;
}

function formatDurationDisplay(totalHours: number): string {
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);

  if (days > 0 && hours > 0) {
    return `${days} ${days === 1 ? "day" : "days"} ${hours} ${
      hours === 1 ? "hour" : "hours"
    }`;
  }
  if (days > 0) return String(days);
  if (hours > 0) return `${hours}h`;
  return "";
}

function resolveDurationHours(
  durationHours: number | null | undefined,
  start: string,
  due: string,
  workingDays: number[]
): number | null {
  const days = workingDaysBetween(start, due, workingDays);
  if (days != null && start && due) return days * 24;
  if (durationHours != null) return durationHours;
  return null;
}

function parseEffortInput(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|h)?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (Number.isNaN(hours) || hours < 0) return null;
  return hours;
}

function formatEffortDisplay(hours: number): string {
  if (hours <= 0) return "";
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Jodit (and similar rich-text editors) often emit empty placeholders like
 * `<p><br></p>` on init even when the stored description is "". Treat those
 * as empty so opening a task without editing does not look "dirty". */
function normalizeDescriptionHtml(html: string | null | undefined): string {
  const raw = (html || "").trim();
  if (!raw) return "";
  const stripped = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/<div>\s*<\/div>/gi, "")
    .replace(/\s+/g, "")
    .trim();
  return stripped === "" ? "" : html || "";
}

function formatHoursPerDay(effortHours: number, durationDays: number): string {
  if (durationDays <= 0) return "—";
  const perDay = effortHours / durationDays;
  const rounded = Math.round(perDay * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatActivityTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getActivityEventIcon(action: string) {
  if (action === "created") return PlusCircle;
  if (action === "assigned") return UserPlus;
  if (action === "deleted") return Trash2;
  if (action.includes("attachment")) return Paperclip;
  if (action.includes("date") || action.includes("duration") || action.includes("working")) {
    return Calendar;
  }
  if (action.includes("status")) return CheckSquare;
  if (action.includes("priority")) return Flag;
  return Clock;
}

function getActivityEventStyle(action: string) {
  if (action === "created") {
    return {
      dot: "bg-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      text: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (action === "assigned") {
    return {
      dot: "bg-violet-400",
      bg: "bg-violet-50 dark:bg-violet-500/10",
      text: "text-violet-700 dark:text-violet-400",
    };
  }
  if (action === "deleted") {
    return {
      dot: "bg-red-400",
      bg: "bg-red-50 dark:bg-red-500/10",
      text: "text-red-600 dark:text-red-400",
    };
  }
  if (action.includes("attachment")) {
    return {
      dot: "bg-amber-400",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      text: "text-amber-700 dark:text-amber-400",
    };
  }
  if (action.includes("date") || action.includes("duration") || action.includes("effort")) {
    return {
      dot: "bg-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      text: "text-blue-700 dark:text-blue-400",
    };
  }
  if (action.includes("status")) {
    return {
      dot: "bg-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-400/10",
      text: "text-cyan-700 dark:text-cyan-400",
    };
  }
  return {
    dot: "bg-slate-400",
    bg: "bg-slate-50 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-300",
  };
}

type CommentToken =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "underline"; text: string }
  | { kind: "strike"; text: string };

function collectMentionUsernames(
  commentMentions?: Array<{ _id?: string; username?: string }>,
  members: MemberOption[] = []
): string[] {
  const memberById = new Map(
    members.map((member) => [member.user._id, member.user.username])
  );

  const fromComments = (commentMentions ?? []).flatMap((mention) => {
    const names: string[] = [];
    if (mention.username) names.push(mention.username);
    if (mention._id) {
      const resolved = memberById.get(mention._id);
      if (resolved) names.push(resolved);
    }
    return names;
  });

  const fromMembers = members.map((member) => member.user.username);

  return [...new Set([...fromComments, ...fromMembers])].sort(
    (a, b) => b.length - a.length
  );
}

function parseCommentTokens(body: string, usernames: string[]): CommentToken[] {
  const tokens: CommentToken[] = [];
  let index = 0;

  while (index < body.length) {
    let matched = false;

    if (body[index] === "@") {
      for (const username of usernames) {
        const mention = `@${username}`;
        if (body.startsWith(mention, index)) {
          tokens.push({ kind: "mention", text: mention });
          index += mention.length;
          matched = true;
          break;
        }
      }
    }

    if (!matched && body.startsWith("**", index)) {
      const end = body.indexOf("**", index + 2);
      if (end !== -1) {
        tokens.push({ kind: "bold", text: body.slice(index + 2, end) });
        index = end + 2;
        matched = true;
      }
    }

    if (!matched && body.startsWith("__", index)) {
      const end = body.indexOf("__", index + 2);
      if (end !== -1) {
        tokens.push({ kind: "underline", text: body.slice(index + 2, end) });
        index = end + 2;
        matched = true;
      }
    }

    if (!matched && body[index] === "*" && !body.startsWith("**", index)) {
      const end = body.indexOf("*", index + 1);
      if (end !== -1) {
        tokens.push({ kind: "italic", text: body.slice(index + 1, end) });
        index = end + 1;
        matched = true;
      }
    }

    if (!matched && body.startsWith("~~", index)) {
      const end = body.indexOf("~~", index + 2);
      if (end !== -1) {
        tokens.push({ kind: "strike", text: body.slice(index + 2, end) });
        index = end + 2;
        matched = true;
      }
    }

    if (!matched) {
      let next = body.length;
      for (let cursor = index + 1; cursor < body.length; cursor++) {
        if (
          body[cursor] === "@" ||
          body.startsWith("**", cursor) ||
          body.startsWith("__", cursor) ||
          body.startsWith("~~", cursor) ||
          (body[cursor] === "*" && !body.startsWith("**", cursor))
        ) {
          next = cursor;
          break;
        }
      }
      tokens.push({ kind: "text", text: body.slice(index, next) });
      index = next;
    }
  }

  return tokens;
}

function renderCommentContent(
  body: string,
  commentMentions?: Array<{ _id?: string; username?: string }>,
  members: MemberOption[] = []
) {
  const usernames = collectMentionUsernames(commentMentions, members);

  return parseCommentTokens(body, usernames).map((token, index) => {
    switch (token.kind) {
      case "mention":
        return (
          <span key={index} className="text-cyan-700 font-medium dark:text-cyan-400">
            {token.text}
          </span>
        );
      case "bold":
        return (
          <strong key={index} className="font-semibold text-slate-900 dark:text-slate-100">
            {token.text}
          </strong>
        );
      case "italic":
        return (
          <em key={index} className="italic text-slate-700 dark:text-slate-200">
            {token.text}
          </em>
        );
      case "underline":
        return (
          <u key={index} className="underline decoration-cyan-500/60">
            {token.text}
          </u>
        );
      case "strike":
        return (
          <del key={index} className="line-through text-slate-400 dark:text-slate-500">
            {token.text}
          </del>
        );
      default:
        return <span key={index}>{token.text}</span>;
    }
  });
}

function normalizeMembers(data: unknown): MemberOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => {
      const m = entry as { user?: unknown; role?: string };
      const user = m.user;
      if (!user || typeof user !== "object") return null;

      const u = user as { _id?: string; username?: string; email?: string };
      if (!u._id || !u.username) return null;

      return {
        user: {
          _id: String(u._id),
          username: u.username,
          email: u.email || "",
        },
        role: m.role || "member",
      };
    })
    .filter((m): m is MemberOption => m !== null);
}

function getMentionMatch(textBeforeCursor: string) {
  const atIndex = textBeforeCursor.lastIndexOf("@");
  if (atIndex === -1) return null;

  const query = textBeforeCursor.slice(atIndex + 1);
  if (query.includes("\n")) return null;

  return { atIndex, query };
}

/** Read-only rendering of a Jodit-authored description (sanitized HTML via
 * dangerouslySetInnerHTML) — light typography defaults since raw HTML has
 * none of its own, matching the app's existing card/text conventions. */
const DESCRIPTION_READ_VIEW_CLASS =
  "w-full flex-1 min-h-[100px] overflow-y-auto task-detail-thin-scroll text-sm text-slate-900 px-3 py-2.5 dark:text-slate-100 " +
  "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_a]:text-cyan-600 [&_a]:underline dark:[&_a]:text-cyan-400 " +
  "[&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic dark:[&_blockquote]:border-slate-600 " +
  // Keep inline/pasted images from sitting on top of the text (no float overlap).
  "[&_img]:float-none [&_img]:clear-both [&_img]:block [&_img]:max-w-full [&_img]:h-auto " +
  "[&_img]:my-2 [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-slate-700";

/** Purely presentational section heading used to give the dialog consistent
 * visual rhythm — small uppercase tracked-out label with an optional icon
 * and trailing action slot. No state or logic lives here. */
const SECTION_TINTS = {
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
} as const;

const SECTION_TEXT_TINTS = {
  violet: "text-violet-600 dark:text-violet-400",
  amber: "text-amber-600 dark:text-amber-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
} as const;

function SectionLabel({
  icon: Icon,
  children,
  action,
  tint,
  inline,
}: {
  icon?: ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
  action?: ReactNode;
  /** Small colored icon chip instead of a plain gray icon — used for the
   * always-visible summary cards (Assignees/Tags/Schedule/Effort) to give
   * them the same "stat card" visual language as the dashboard. */
  tint?: keyof typeof SECTION_TINTS;
  /** Sit beside its field instead of stacked above it — drops the bottom
   * margin and keeps the label from shrinking in a flex row. */
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${inline ? "shrink-0" : "mb-2.5"}`}>
      <div
        className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
          tint ? SECTION_TEXT_TINTS[tint] : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {Icon && tint ? (
          <span
            className={`grid h-5 w-5 place-items-center rounded-md ${SECTION_TINTS[tint]}`}
          >
            <Icon size={12} />
          </span>
        ) : (
          Icon && <Icon size={13} className="text-slate-400 dark:text-slate-500" />
        )}
        {children}
      </div>
      {action}
    </div>
  );
}

export default function TaskDetailDialog({
  task,
  projectId,
  canEdit,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  onClose,
  onUpdated,
  onDeleted,
  activeSubtaskId = null,
  onSubtaskOpen,
  onNavigateParent,
  initialTab = "details",
  onRestore,
  restoring = false,
}: Props) {
  const { user: currentUser } = useCurrentUser();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    assigneeIdsFromTask(task)
  );
  const [startDate, setStartDate] = useState(toDateKey(task.startDate));
  const [dueDate, setDueDate] = useState(toDateKey(task.dueDate));
  const [durationInput, setDurationInput] = useState("");
  const [durationTotalHours, setDurationTotalHours] = useState<number | null>(
    null
  );
  const [effortInput, setEffortInput] = useState("");
  const [effortHours, setEffortHours] = useState<number | null>(null);
  const [effortEnabled, setEffortEnabled] = useState(false);
  const [workingDaysConfig, setWorkingDaysConfig] = useState<number[]>([
    ...DEFAULT_WORKING_DAYS,
  ]);
  const [customWorkingDays, setCustomWorkingDays] = useState(false);
  const [workingDaysDialogOpen, setWorkingDaysDialogOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState((task.tags || []).join(", "));
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [attachments, setAttachments] = useState(task.attachments || []);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    url: string;
    name: string;
    kind: "image" | "pdf";
  } | null>(null);
  const [activityFeed, setActivityFeed] = useState<TaskActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [pendingChatFiles, setPendingChatFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [hoverDate, setHoverDate] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: task.startDate ? parseDateKey(toDateKey(task.startDate)) : undefined,
    to: task.dueDate ? parseDateKey(toDateKey(task.dueDate)) : undefined,
  }));
  const [uploading, setUploading] = useState(false);
  const [chatUploading, setChatUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);
  // Ticks periodically so the 2-minute comment-edit window expires live in
  // the UI (hiding the Edit button) without needing a manual refresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(task.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [message, setMessage] = useState("");
  // Explicit "Save changes" button for the main task (no more autosave).
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveMsg, setTaskSaveMsg] = useState("");
  // Local feedback for the Schedule box's "Save date" confirm action.
  const [dateSaveMsg, setDateSaveMsg] = useState("");
  // Schedule is now a popover opened from a compact summary card instead of
  // an always-visible inline calendar — this just toggles that popover.
  const [scheduleCalendarOpen, setScheduleCalendarOpen] = useState(false);
  // Baseline of the last-persisted payload — lets the Save button disable
  // itself when there's nothing new to save, and lets Close warn before
  // discarding unsaved edits. null = still hydrating from the opened task
  // (duration sync + rich-text editor init after first paint), so we must not
  // treat that as "dirty" or the discard popup fires on every Close.
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  // Same idea as savedSignature, but for whichever subtask is currently open.
  const savedSubtaskSigRef = useRef<string>("");
  const taskSignatureRef = useRef("");
  const subtaskSignatureRef = useRef("");
  // Non-null while the just-opened task (or subtask) is still absorbing
  // automatic field updates. Close must not prompt during this window.
  const hydratingTaskIdRef = useRef<string | null>(task._id);
  const hydratingSubtaskIdRef = useRef<string | null>(null);
  // Bumped when subtask hydration ends so hasUnsavedChanges re-evaluates
  // after refs change without a related useState update.
  const [dirtyEpoch, setDirtyEpoch] = useState(0);
  const chatRef = useRef<HTMLTextAreaElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSelectionRef = useRef({ start: 0, end: 0 });
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(
    null
  );
  // Formatting toolbar + image-paste support for the main task's Description
  // field (subtasks have no Attachments tab, so this only wires up here).
  const [descriptionUploading, setDescriptionUploading] = useState(false);
  // Thumbnails for images pasted/attached into the Description box this
  // session — built from local object URLs so they render instantly,
  // without waiting on an authenticated fetch of the uploaded copy.
  const [descriptionImagePreviews, setDescriptionImagePreviews] = useState<
    { id: string; url: string; name: string }[]
  >([]);
  const descriptionFileRef = useRef<HTMLInputElement>(null);
  const activeSubtask = useMemo(
    () => subtasks.find((row) => row._id === activeSubtaskId) || null,
    [subtasks, activeSubtaskId]
  );
  // The breadcrumb should point at the immediate parent — another subtask
  // when nested, or the task itself for a top-level subtask — not always
  // jump straight to the task.
  const activeSubtaskParent = useMemo(
    () =>
      activeSubtask?.parentSubtaskId
        ? subtasks.find((row) => row._id === activeSubtask.parentSubtaskId) || null
        : null,
    [subtasks, activeSubtask]
  );
  const greatGrandparentSubtask = useMemo(
    () =>
      activeSubtaskParent?.parentSubtaskId
        ? subtasks.find((row) => row._id === activeSubtaskParent.parentSubtaskId) || null
        : null,
    [subtasks, activeSubtaskParent]
  );

  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDescription, setSubtaskDescription] = useState("");
  const [subtaskPriority, setSubtaskPriority] = useState("medium");
  const [subtaskStartDate, setSubtaskStartDate] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [subtaskRange, setSubtaskRange] = useState<DateRange | undefined>();
  const [subtaskHoverDate, setSubtaskHoverDate] = useState<Date | undefined>();
  const [subtaskDurationInput, setSubtaskDurationInput] = useState("");
  const [subtaskDurationTotalHours, setSubtaskDurationTotalHours] = useState<
    number | null
  >(null);
  const [subtaskAssigneeIds, setSubtaskAssigneeIds] = useState<string[]>([]);
  const [subtaskStatus, setSubtaskStatus] = useState("todo");
  const [subtaskEffortInput, setSubtaskEffortInput] = useState("");
  const [subtaskEffortHours, setSubtaskEffortHours] = useState<number | null>(
    null
  );
  const [subtaskEffortEnabled, setSubtaskEffortEnabled] = useState(false);
  // Mirrors workingDaysConfig/customWorkingDays but scoped to whichever
  // subtask is open — subtasks have their own persisted `workingDays`, not
  // the parent task's.
  const [subtaskWorkingDaysConfig, setSubtaskWorkingDaysConfig] = useState<
    number[]
  >([...DEFAULT_WORKING_DAYS]);
  const [subtaskCustomWorkingDays, setSubtaskCustomWorkingDays] =
    useState(false);

  useEffect(() => {
    if (!activeSubtask) {
      setSubtaskTitle("");
      setSubtaskDescription("");
      setSubtaskPriority("medium");
      setSubtaskStartDate("");
      setSubtaskDueDate("");
      setSubtaskRange(undefined);
      setSubtaskHoverDate(undefined);
      setSubtaskDurationInput("");
      setSubtaskDurationTotalHours(null);
      setSubtaskAssigneeIds([]);
      setSubtaskStatus("todo");
      setSubtaskEffortInput("");
      setSubtaskEffortHours(null);
      setSubtaskEffortEnabled(false);
      setSubtaskWorkingDaysConfig([...DEFAULT_WORKING_DAYS]);
      setSubtaskCustomWorkingDays(false);
      hydratingSubtaskIdRef.current = null;
      return;
    }
    const start = toDateKey(activeSubtask.startDate);
    const due = toDateKey(activeSubtask.dueDate);
    setSubtaskTitle(activeSubtask.title);
    setSubtaskDescription(normalizeDescriptionHtml(activeSubtask.description));
    setSubtaskPriority(activeSubtask.priority || "medium");
    setSubtaskStartDate(start);
    setSubtaskDueDate(due);
    setSubtaskRange({
      from: start ? parseDateKey(start) : undefined,
      to: due ? parseDateKey(due) : undefined,
    });
    const subWorkingDays = normalizeWorkingDays(activeSubtask.workingDays);
    const subCustomWorkingDays = !isDefaultWorkingDays(subWorkingDays);
    setSubtaskWorkingDaysConfig(subWorkingDays);
    setSubtaskCustomWorkingDays(subCustomWorkingDays);
    const subHours = resolveDurationHours(
      activeSubtask.durationHours ?? null,
      start,
      due,
      subWorkingDays
    );
    setSubtaskDurationTotalHours(subHours);
    setSubtaskDurationInput(subHours != null ? formatDurationDisplay(subHours) : "");
    setSubtaskAssigneeIds(assigneeIdsFromTask(activeSubtask));
    const subStatus = resolveSubtaskStatus(activeSubtask);
    setSubtaskStatus(subStatus);
    const subEffortEnabled =
      activeSubtask.effortHours != null && activeSubtask.effortHours > 0;
    setSubtaskEffortHours(activeSubtask.effortHours ?? null);
    setSubtaskEffortInput(
      activeSubtask.effortHours != null
        ? formatEffortDisplay(activeSubtask.effortHours)
        : ""
    );
    setSubtaskEffortEnabled(subEffortEnabled);

    // Stay in "hydrating" until the editor/duration effects settle — otherwise
    // Jodit's empty placeholder HTML marks a freshly opened subtask dirty.
    hydratingSubtaskIdRef.current = activeSubtask._id;
    savedSubtaskSigRef.current = JSON.stringify({
      title: activeSubtask.title.trim(),
      description: normalizeDescriptionHtml(activeSubtask.description),
      priority: activeSubtask.priority || "medium",
      status: subStatus,
      startDate: start || null,
      dueDate: due || null,
      assignees: assigneeIdsFromTask(activeSubtask),
      completed: subStatus === "completed",
      effortHours: subEffortEnabled ? activeSubtask.effortHours ?? null : null,
      durationHours: subHours,
      workingDays: subCustomWorkingDays ? subWorkingDays : null,
    });
  }, [activeSubtask]);

  const statusLabelFor = useCallback(
    (statusId: string) =>
      statusOptions.find((option) => option.value === statusId)?.label ||
      statusId,
    [statusOptions]
  );

  const isSubtaskView = Boolean(activeSubtask);

  // "On leave" awareness for the assignee picker — best-effort UX warning,
  // refetched whenever the relevant due date changes. The backend still
  // hard-blocks the actual assignment either way.
  const { currentOrgId } = useOrganization();
  const [onLeaveUserIds, setOnLeaveUserIds] = useState<Set<string>>(new Set());
  const activeDueDateForLeaveCheck = isSubtaskView ? subtaskDueDate : dueDate;

  useEffect(() => {
    if (!currentOrgId || !activeDueDateForLeaveCheck) {
      setOnLeaveUserIds(new Set());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const onLeave = await fetchUsersOnLeave(currentOrgId, activeDueDateForLeaveCheck);
        if (!cancelled) setOnLeaveUserIds(new Set(onLeave.map((o) => o.userId)));
      } catch {
        if (!cancelled) setOnLeaveUserIds(new Set());
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentOrgId, activeDueDateForLeaveCheck]);

  const [activeTab, setActiveTab] = useState<TaskTab>(initialTab);

  useEffect(() => {
    // Attachments tab doesn't exist while editing a subtask — fall back to
    // Details so the dialog never shows a blank pane. Subtasks stays valid
    // in subtask view (it shows that subtask's own nested children), except
    // at the maximum nesting level, where a subtask can't have children.
    if (isSubtaskView && activeTab === "attachments") {
      setActiveTab("details");
      return;
    }
    if (
      isSubtaskView &&
      activeTab === "subtasks" &&
      activeSubtask &&
      subtaskLevelOf(activeSubtask, subtasks) >= MAX_SUBTASK_LEVEL
    ) {
      setActiveTab("details");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubtaskView, activeTab, activeSubtask]);

  // Assignees is always visible now (no longer a tab-gated field a chip has
  // to jump to), but the picker keeps this ref/signal plumbing for its own
  // internal open behavior.
  const assigneeFieldRef = useRef<HTMLDivElement>(null);
  const [assigneeOpenSignal] = useState(0);

  // Close the schedule popover on any click outside it. The Working days
  // dialog it can open renders as its own fixed-position overlay elsewhere
  // in the tree (not a DOM descendant of the popover), so without this
  // guard the very first click inside that dialog — toggling a day, hitting
  // Apply — reads as an "outside click" and closes the Schedule popover out
  // from under it before Save date is ever reachable.
  const scheduleCalendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scheduleCalendarOpen || workingDaysDialogOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!scheduleCalendarRef.current?.contains(event.target as Node)) {
        setScheduleCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [scheduleCalendarOpen, workingDaysDialogOpen]);

  const shareUrl = useMemo(() => {
    const path = buildTaskUrl(
      projectId,
      task._id,
      isSubtaskView ? activeSubtaskId : null
    );
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [projectId, task._id, activeSubtaskId, isSubtaskView]);

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Link copied");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Could not copy link");
    }
  };

  const selectingEnd = Boolean(range?.from && !range?.to);
  const isPreviewingDue = selectingEnd && Boolean(hoverDate);
  const displayDueKey = selectingEnd && hoverDate
    ? format(hoverDate, "yyyy-MM-dd")
    : range?.to
      ? format(range.to, "yyyy-MM-dd")
      : dueDate;

  const computedWorkingDays = workingDaysBetween(
    startDate,
    displayDueKey,
    workingDaysConfig
  );

  const activeDurationDays = useMemo(() => {
    if (startDate && displayDueKey && computedWorkingDays != null) {
      return computedWorkingDays;
    }
    const parsed = parseDurationInput(durationInput);
    return parsed?.days ?? null;
  }, [startDate, displayDueKey, computedWorkingDays, durationInput]);

  const displayDurationValue = useMemo(() => {
    if (startDate && displayDueKey && computedWorkingDays != null) {
      const hourRemainder = (durationTotalHours ?? 0) % 24;
      if (hourRemainder > 0) {
        return formatDurationDisplay(
          computedWorkingDays * 24 + hourRemainder
        );
      }
      return String(computedWorkingDays);
    }
    return durationInput;
  }, [
    startDate,
    displayDueKey,
    computedWorkingDays,
    durationTotalHours,
    durationInput,
  ]);

  const durationSuffix = useMemo(() => {
    const parsed = parseDurationInput(displayDurationValue);
    if (!parsed || parsed.hours > 0) return "";
    if (parsed.days > 0) {
      return parsed.days === 1 ? "working day" : "working days";
    }
    return "";
  }, [displayDurationValue]);

  const calendarModifiers = useMemo(() => {
    const preview =
      range?.from && !range?.to && hoverDate
        ? (date: Date) => {
            const a = range.from!;
            const b = hoverDate;
            const start = a < b ? a : b;
            const end = a < b ? b : a;
            return isWithinInterval(date, { start, end });
          }
        : undefined;

    return {
      preview: preview || (() => false),
      preview_end:
        range?.from && !range?.to && hoverDate
          ? (date: Date) => isSameDay(date, hoverDate)
          : () => false,
      weekend: (date: Date) => !isWorkingDay(date, workingDaysConfig),
    };
  }, [range, hoverDate, workingDaysConfig]);

  const loadedDetailIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTaskDetail() {
      if (loadedDetailIdRef.current === task._id) return;
      loadedDetailIdRef.current = task._id;

      const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`);
      if (!res.ok || cancelled) return;
      const full = (await res.json()) as typeof task;
      // Only enriches locally-held fields (attachments/subtasks need populated
      // uploader/creator info the lightweight board-list task doesn't have) —
      // deliberately does NOT call onUpdated, since that would push a board-wide
      // refresh every time a task dialog is merely opened.
      setAttachments(full.attachments || []);
      setSubtasks(full.subtasks || []);
    }

    loadTaskDetail().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, task._id]);

  useEffect(() => {
    async function loadMembers() {
      const memRes = await authFetch(`/projects/${projectId}/members`);
      if (memRes.ok) {
        // Only accepted project members — pending invitees must not appear
        // in the assignee picker until they accept the invitation.
        setMembers(normalizeMembers(await memRes.json()));
        return;
      }

      setMembers([]);
    }

    loadMembers().catch(() => setMembers([]));
  }, [projectId]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const query = activeSubtaskId ? `?subtaskId=${activeSubtaskId}` : "";
      const res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/activity${query}`
      );
      if (res.ok) {
        const data = await res.json();
        setActivityFeed(Array.isArray(data) ? data : []);
      } else {
        setActivityFeed([]);
      }
    } catch {
      setActivityFeed([]);
    } finally {
      setActivityLoading(false);
    }
  }, [projectId, task._id, activeSubtaskId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Seeds the local edit buffer ONLY when a genuinely different task is
  // opened (task._id) — not on every incidental prop update (e.g. the task
  // object onUpdated() receives back from an attachment upload, which
  // reflects whatever description/etc. was last SAVED, not what's currently
  // being typed). Without this guard, attaching an image mid-edit would
  // silently reset in-progress, unsaved text back to the old server value —
  // now that Save is explicit rather than autosaved, that's a real data-loss
  // trap, not just a cosmetic flicker.
  useEffect(() => {
    setTitle(task.title);
    setDescription(normalizeDescriptionHtml(task.description));
    setStatus(task.status);
    setPriority(task.priority);
    const taskAssigneeIds = assigneeIdsFromTask(task);
    setAssigneeIds(taskAssigneeIds);
    const start = toDateKey(task.startDate);
    const due = toDateKey(task.dueDate);
    setStartDate(start);
    setDueDate(due);
    const taskWorkingDays = normalizeWorkingDays(task.workingDays);
    const taskCustomWorkingDays = !isDefaultWorkingDays(taskWorkingDays);
    setWorkingDaysConfig(taskWorkingDays);
    setCustomWorkingDays(taskCustomWorkingDays);
    const hours = resolveDurationHours(
      task.durationHours,
      start,
      due,
      taskWorkingDays
    );
    setDurationTotalHours(hours);
    setDurationInput(hours != null ? formatDurationDisplay(hours) : "");
    const taskEffortEnabled = task.effortHours != null && task.effortHours > 0;
    setEffortHours(task.effortHours ?? null);
    setEffortInput(
      task.effortHours != null ? formatEffortDisplay(task.effortHours) : ""
    );
    setEffortEnabled(taskEffortEnabled);
    setRange({
      from: start ? parseDateKey(start) : undefined,
      to: due ? parseDateKey(due) : undefined,
    });
    setTagsInput((task.tags || []).join(", "));
    setAttachments(task.attachments || []);
    setSubtasks(task.subtasks || []);

    // Hold the dirty baseline open until duration sync + Jodit init settle.
    // While savedSignature is null, Close will not prompt.
    hydratingTaskIdRef.current = task._id;
    setSavedSignature(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task._id]);

  useEffect(() => {
    setSubtasks(task.subtasks || []);
    setAttachments(task.attachments || []);
  }, [task._id, task.subtasks, task.attachments]);

  useEffect(() => {
    return () => {
      setAttachmentPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [task._id]);

  useEffect(() => {
    if (!startDate || !dueDate || isPreviewingDue) return;
    const days = workingDaysBetween(startDate, dueDate, workingDaysConfig);
    if (days == null) return;
    const hourRemainder = durationTotalHours != null ? durationTotalHours % 24 : 0;
    const total = days * 24 + hourRemainder;
    const display = formatDurationDisplay(total);
    // Skip no-op writes — otherwise the post-open duration sync alone marks
    // a freshly opened, untouched task as having unsaved changes.
    if (durationTotalHours === total && durationInput === display) return;
    setDurationTotalHours(total);
    setDurationInput(display);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit duration fields to avoid feedback loops
  }, [startDate, dueDate, isPreviewingDue, workingDaysConfig]);

  useEffect(() => {
    if (activityFeed.length === 0) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityFeed.length]);

  useLayoutEffect(() => {
    const el = chatRef.current;
    const pending = pendingSelectionRef.current;
    if (!el || !pending) return;

    el.focus();
    el.setSelectionRange(pending.start, pending.end);
    chatSelectionRef.current = pending;
    pendingSelectionRef.current = null;
  }, [chatInput]);

  useEffect(() => {
    return () => {
      descriptionImagePreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMembers = members.filter((m) =>
    m.user.username.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const activeDescriptionValue = isSubtaskView ? subtaskDescription : description;
  const descriptionEditable = isSubtaskView
    ? canEdit && !subtaskSaving
    : canEdit;
  // Anyone who can edit always sees the toolbar + editable textarea — it
  // must not disappear just because focus moved elsewhere while typing.
  // Only view-only users (no edit permission) get the read-only, formatted
  // rendering instead.
  const showDescriptionEditor = descriptionEditable;

  const syncDatesFromRange = (selected: DateRange | undefined) => {
    setRange(selected);
    if (selected?.from) {
      const start = format(selected.from, "yyyy-MM-dd");
      setStartDate(start);
      if (selected.to) {
        const due = format(selected.to, "yyyy-MM-dd");
        setDueDate(due);
        const d = workingDaysBetween(start, due, workingDaysConfig);
        if (d != null) {
          const hourRemainder = durationTotalHours != null ? durationTotalHours % 24 : 0;
          const total = d * 24 + hourRemainder;
          setDurationTotalHours(total);
          setDurationInput(formatDurationDisplay(total));
        }
      } else {
        setDueDate("");
        setDurationInput("");
        setDurationTotalHours(null);
      }
    }
  };

  const subtaskSelectingEnd = Boolean(subtaskRange?.from && !subtaskRange?.to);
  const subtaskIsPreviewingDue = subtaskSelectingEnd && Boolean(subtaskHoverDate);
  const subtaskDisplayDueKey =
    subtaskSelectingEnd && subtaskHoverDate
      ? format(subtaskHoverDate, "yyyy-MM-dd")
      : subtaskRange?.to
        ? format(subtaskRange.to, "yyyy-MM-dd")
        : subtaskDueDate;

  const subtaskComputedWorkingDays = workingDaysBetween(
    subtaskStartDate,
    subtaskDisplayDueKey,
    subtaskWorkingDaysConfig
  );

  const subtaskActiveDurationDays = useMemo(() => {
    if (
      subtaskStartDate &&
      subtaskDisplayDueKey &&
      subtaskComputedWorkingDays != null
    ) {
      return subtaskComputedWorkingDays;
    }
    const parsed = parseDurationInput(subtaskDurationInput);
    return parsed?.days ?? null;
  }, [
    subtaskStartDate,
    subtaskDisplayDueKey,
    subtaskComputedWorkingDays,
    subtaskDurationInput,
  ]);

  const subtaskDisplayDurationValue = useMemo(() => {
    if (
      subtaskStartDate &&
      subtaskDisplayDueKey &&
      subtaskComputedWorkingDays != null
    ) {
      const hourRemainder =
        subtaskDurationTotalHours != null ? subtaskDurationTotalHours % 24 : 0;
      if (hourRemainder > 0) {
        return formatDurationDisplay(
          subtaskComputedWorkingDays * 24 + hourRemainder
        );
      }
      return String(subtaskComputedWorkingDays);
    }
    return subtaskDurationInput;
  }, [
    subtaskStartDate,
    subtaskDisplayDueKey,
    subtaskComputedWorkingDays,
    subtaskDurationTotalHours,
    subtaskDurationInput,
  ]);

  const subtaskDurationSuffix = useMemo(() => {
    const parsed = parseDurationInput(subtaskDisplayDurationValue);
    if (!parsed || parsed.hours > 0) return "";
    if (parsed.days > 0) {
      return parsed.days === 1 ? "working day" : "working days";
    }
    return "";
  }, [subtaskDisplayDurationValue]);

  const subtaskCalendarModifiers = useMemo(() => {
    const preview =
      subtaskRange?.from && !subtaskRange?.to && subtaskHoverDate
        ? (date: Date) => {
            const a = subtaskRange.from!;
            const b = subtaskHoverDate;
            const start = a < b ? a : b;
            const end = a < b ? b : a;
            return isWithinInterval(date, { start, end });
          }
        : undefined;

    return {
      preview: preview || (() => false),
      preview_end:
        subtaskRange?.from && !subtaskRange?.to && subtaskHoverDate
          ? (date: Date) => isSameDay(date, subtaskHoverDate)
          : () => false,
      weekend: (date: Date) => !isWorkingDay(date, subtaskWorkingDaysConfig),
    };
  }, [subtaskRange, subtaskHoverDate, subtaskWorkingDaysConfig]);

  const syncSubtaskDatesFromRange = (selected: DateRange | undefined) => {
    setSubtaskRange(selected);
    if (selected?.from) {
      const start = format(selected.from, "yyyy-MM-dd");
      setSubtaskStartDate(start);
      if (selected.to) {
        const due = format(selected.to, "yyyy-MM-dd");
        setSubtaskDueDate(due);
        const d = workingDaysBetween(start, due, subtaskWorkingDaysConfig);
        if (d != null) {
          const hourRemainder =
            subtaskDurationTotalHours != null ? subtaskDurationTotalHours % 24 : 0;
          const total = d * 24 + hourRemainder;
          setSubtaskDurationTotalHours(total);
          setSubtaskDurationInput(formatDurationDisplay(total));
        }
      } else {
        setSubtaskDueDate("");
        setSubtaskDurationInput("");
        setSubtaskDurationTotalHours(null);
      }
    }
  };

  // Keep subtask duration in sync when its own working-day set changes
  // (mirrors the main-task effect — must use subtaskWorkingDaysConfig).
  useEffect(() => {
    if (!activeSubtaskId) return;
    if (!subtaskStartDate || !subtaskDueDate || subtaskIsPreviewingDue) return;
    const days = workingDaysBetween(
      subtaskStartDate,
      subtaskDueDate,
      subtaskWorkingDaysConfig
    );
    if (days == null) return;
    const hourRemainder =
      subtaskDurationTotalHours != null ? subtaskDurationTotalHours % 24 : 0;
    const total = days * 24 + hourRemainder;
    const display = formatDurationDisplay(total);
    if (subtaskDurationTotalHours === total && subtaskDurationInput === display) {
      return;
    }
    setSubtaskDurationTotalHours(total);
    setSubtaskDurationInput(display);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSubtaskId,
    subtaskStartDate,
    subtaskDueDate,
    subtaskIsPreviewingDue,
    subtaskWorkingDaysConfig,
  ]);

  const applySubtaskDurationInput = (raw: string) => {
    setSubtaskDurationInput(raw);
    const parsed = parseDurationInput(raw);
    if (!parsed || !subtaskStartDate) return;

    setSubtaskDurationTotalHours(parsed.totalHours);
    const dueKey = dueDateFromDuration(
      subtaskStartDate,
      parsed.days,
      parsed.hours,
      subtaskWorkingDaysConfig
    );
    if (!dueKey) return;

    setSubtaskDueDate(dueKey);
    setSubtaskRange({
      from: parseDateKey(subtaskStartDate),
      to: parseDateKey(dueKey),
    });
  };

  const formatSubtaskDurationOnBlur = () => {
    const parsed = parseDurationInput(subtaskDurationInput);
    if (!parsed) return;
    setSubtaskDurationInput(formatDurationDisplay(parsed.totalHours));
  };

  const applyDurationInput = (raw: string) => {
    setDurationInput(raw);
    const parsed = parseDurationInput(raw);
    if (!parsed || !startDate) return;

    setDurationTotalHours(parsed.totalHours);
    const dueKey = dueDateFromDuration(
      startDate,
      parsed.days,
      parsed.hours,
      workingDaysConfig
    );
    if (!dueKey) return;

    setDueDate(dueKey);
    setRange({ from: parseDateKey(startDate), to: parseDateKey(dueKey) });
  };

  const formatDurationOnBlur = () => {
    const parsed = parseDurationInput(durationInput);
    if (!parsed) return;
    setDurationInput(formatDurationDisplay(parsed.totalHours));
    setDurationTotalHours(parsed.totalHours);
  };

  const applyEffortInput = (raw: string) => {
    setEffortInput(raw);
    const parsed = parseEffortInput(raw);
    setEffortHours(parsed);
  };

  const formatEffortOnBlur = () => {
    const parsed = parseEffortInput(effortInput);
    if (parsed == null) {
      setEffortInput("");
      setEffortHours(null);
      return;
    }
    setEffortInput(formatEffortDisplay(parsed));
    setEffortHours(parsed);
  };

  const handleWorkingDaysCheckbox = (enabled: boolean) => {
    if (!canEdit) return;
    if (enabled) {
      setCustomWorkingDays(true);
      setWorkingDaysDialogOpen(true);
      return;
    }
    setCustomWorkingDays(false);
    setWorkingDaysConfig([...DEFAULT_WORKING_DAYS]);
  };

  const handleWorkingDaysApply = (days: number[]) => {
    const normalized = normalizeWorkingDays(days);
    const isCustom = !isDefaultWorkingDays(normalized);
    if (isSubtaskView) {
      setSubtaskWorkingDaysConfig(normalized);
      setSubtaskCustomWorkingDays(isCustom);
      setDirtyEpoch((n) => n + 1);
      return;
    }
    setWorkingDaysConfig(normalized);
    setCustomWorkingDays(isCustom);
  };

  const handleSubtaskWorkingDaysCheckbox = (enabled: boolean) => {
    if (!canEdit) return;
    if (enabled) {
      setSubtaskCustomWorkingDays(true);
      setWorkingDaysDialogOpen(true);
      return;
    }
    setSubtaskCustomWorkingDays(false);
    setSubtaskWorkingDaysConfig([...DEFAULT_WORKING_DAYS]);
  };

  const handleEffortToggle = (enabled: boolean) => {
    if (!canEdit) return;
    setEffortEnabled(enabled);
    if (!enabled) {
      setEffortInput("");
      setEffortHours(null);
    }
  };

  const applySubtaskEffortInput = (raw: string) => {
    setSubtaskEffortInput(raw);
    const parsed = parseEffortInput(raw);
    setSubtaskEffortHours(parsed);
  };

  const formatSubtaskEffortOnBlur = () => {
    const parsed = parseEffortInput(subtaskEffortInput);
    if (parsed == null) {
      setSubtaskEffortInput("");
      setSubtaskEffortHours(null);
      return;
    }
    setSubtaskEffortInput(formatEffortDisplay(parsed));
    setSubtaskEffortHours(parsed);
  };

  const handleSubtaskEffortToggle = (enabled: boolean) => {
    if (!canEdit || subtaskSaving) return;
    setSubtaskEffortEnabled(enabled);
    if (!enabled) {
      setSubtaskEffortInput("");
      setSubtaskEffortHours(null);
    }
  };

  const handleChatChange = (value: string, cursor?: number | null) => {
    setChatInput(value);

    const pos =
      cursor ?? chatRef.current?.selectionStart ?? value.length;
    chatSelectionRef.current = {
      start: pos,
      end: pos,
    };

    const textBefore = value.slice(0, pos);
    const atMatch = getMentionMatch(textBefore);
    if (atMatch) {
      setMentionOpen(true);
      setMentionQuery(atMatch.query);
      setMentionHighlight(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const syncChatSelection = (el: HTMLTextAreaElement) => {
    chatSelectionRef.current = {
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  };

  const wrapSelection = (before: string, after: string) => {
    const el = chatRef.current;
    if (!el) return;

    el.focus();
    const { start, end } = chatSelectionRef.current;
    const value = chatInput;
    const selected = value.slice(start, end);
    const inner = selected || "text";

    const newValue =
      value.slice(0, start) +
      before +
      inner +
      after +
      value.slice(end);

    const cursorStart = start + before.length;
    const cursorEnd = cursorStart + inner.length;

    pendingSelectionRef.current = { start: cursorStart, end: cursorEnd };
    setChatInput(newValue);
  };

  const applyFormat =
    (before: string, after: string) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      wrapSelection(before, after);
    };

  const insertMention = (username: string) => {
    const el = chatRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? chatSelectionRef.current.start;
    const value = el.value;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1) return;

    const newValue = `${before.slice(0, atIndex)}@${username} ${after}`;
    const pos = atIndex + username.length + 2;

    pendingSelectionRef.current = { start: pos, end: pos };
    setChatInput(newValue);
    setMentionOpen(false);
    setMentionQuery("");
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight(
          (i) => (i - 1 + filteredMembers.length) % filteredMembers.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMembers[mentionHighlight].user.username);
        return;
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  };

  const uploadChatAttachment = async (file: File) => {
    setChatUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/attachments`,
      { method: "POST", body: formData }
    );
    setChatUploading(false);
    if (res.ok) {
      const updated = await res.json();
      setAttachments(updated.attachments || []);
      const last = updated.attachments?.[updated.attachments.length - 1];
      if (last) {
        setPendingChatFiles((prev) => [
          ...prev,
          { id: last._id, name: last.originalName },
        ]);
      }
      onUpdated(updated);
      await loadActivity();
    }
  };

  /** Pulls image files out of a clipboard paste (e.g. a screenshot copied
   * from the OS) so composers can attach them without a manual file pick. */
  const extractPastedImages = (e: React.ClipboardEvent): File[] => {
    const items = e.clipboardData?.items;
    if (!items) return [];
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    return files;
  };

  const handleChatPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = extractPastedImages(e);
    if (images.length === 0) return;
    e.preventDefault();
    images.forEach((file) => uploadChatAttachment(file));
  };

  const uploadDescriptionAttachment = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      // Non-image attachments have nothing to preview inline — just upload.
      setDescriptionUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/attachments`,
        { method: "POST", body: formData }
      );
      setDescriptionUploading(false);
      if (res.ok) {
        const updated = await res.json();
        mergeAttachments(updated.attachments || []);
        onUpdated(updated);
        setMessage("File attached");
        setTimeout(() => setMessage(""), 2000);
      }
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localUrl = URL.createObjectURL(file);
    setDescriptionImagePreviews((prev) => [
      ...prev,
      { id: tempId, url: localUrl, name: file.name },
    ]);

    setDescriptionUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("inDescription", "true");
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/attachments`,
      { method: "POST", body: formData }
    );
    setDescriptionUploading(false);

    if (res.ok) {
      const updated = await res.json();
      mergeAttachments(updated.attachments || []);
      onUpdated(updated);
      const last = updated.attachments?.[updated.attachments.length - 1];
      if (last) {
        setDescriptionImagePreviews((prev) =>
          prev.map((p) => (p.id === tempId ? { ...p, id: last._id } : p))
        );
      }
      setMessage("Image attached");
      setTimeout(() => setMessage(""), 2000);
    } else {
      setDescriptionImagePreviews((prev) => {
        const match = prev.find((p) => p.id === tempId);
        if (match) URL.revokeObjectURL(match.url);
        return prev.filter((p) => p.id !== tempId);
      });
      setMessage("Could not attach image");
    }
  };

  const removeDescriptionImage = async (id: string) => {
    const match = descriptionImagePreviews.find((p) => p.id === id);
    setDescriptionImagePreviews((prev) => prev.filter((p) => p.id !== id));
    if (match) URL.revokeObjectURL(match.url);
    if (!id.startsWith("temp-")) {
      await removeAttachment(id);
    }
  };

  const applyTaskUpdate = (updated: TaskItem & { subtasks?: SubtaskItem[] }) => {
    setSubtasks(updated.subtasks || []);
    onUpdated(updated);
    loadActivity();
  };

  // A subtask with no parent is level 1; nesting is capped at level 3
  // (enforced again server-side in addSubtask).
  const subtaskLevelOf = (subtask: SubtaskItem, all: SubtaskItem[]): number => {
    let level = 1;
    let current: SubtaskItem | undefined = subtask;
    while (current?.parentSubtaskId) {
      const parent = all.find((s) => s._id === current!.parentSubtaskId);
      if (!parent) break;
      level += 1;
      current = parent;
    }
    return level;
  };

  const addSubtask = async (parentSubtaskId?: string) => {
    const title = newSubtaskTitle.trim();
    if (!title || subtaskSaving || !canEdit) return;

    setSubtaskSaving(true);
    try {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/subtasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            assignees: [],
            ...(parentSubtaskId ? { parentSubtaskId } : {}),
          }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        applyTaskUpdate(updated);
        setNewSubtaskTitle("");
        const created = updated.subtasks?.[updated.subtasks.length - 1];
        if (created?._id) onSubtaskOpen?.(created._id);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || "Failed to add subtask");
      }
    } catch {
      setMessage("Failed to add subtask");
    } finally {
      setSubtaskSaving(false);
    }
  };

  const confirmDeleteSubtask = async (subtaskId: string, subtaskTitle: string) => {
    const ok = await confirmDialog({
      title: `Delete "${subtaskTitle}"?`,
      description: "This subtask and any of its own subtasks will be permanently removed.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteSubtask(subtaskId);
  };

  const updateSubtask = async (
    subtaskId: string,
    patch: {
      title?: string;
      description?: string;
      priority?: string;
      dueDate?: string | null;
      startDate?: string | null;
      assignee?: string | null;
      assignees?: string[];
      completed?: boolean;
      status?: string;
    }
  ) => {
    if (!canEdit || subtaskSaving) return;

    setSubtaskSaving(true);
    try {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/subtasks/${subtaskId}`,
        {
          method: "PUT",
          body: JSON.stringify(patch),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        applyTaskUpdate(updated);
      }
    } finally {
      setSubtaskSaving(false);
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    if (!canEdit || subtaskSaving) return;

    setSubtaskSaving(true);
    try {
      const res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/subtasks/${subtaskId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        const updated = await res.json();
        applyTaskUpdate(updated);
        if (activeSubtaskId === subtaskId) onNavigateParent?.();
      }
    } finally {
      setSubtaskSaving(false);
    }
  };

  // Shared by the Save button and the dirty-check used to warn before
  // discarding on Close — mirrors buildTaskPayload's role for the main task.
  const buildSubtaskPayload = useCallback(
    () => ({
      title: subtaskTitle.trim(),
      description: normalizeDescriptionHtml(subtaskDescription),
      priority: subtaskPriority,
      status: subtaskStatus,
      startDate: subtaskStartDate || null,
      dueDate: subtaskDueDate || null,
      assignees: subtaskAssigneeIds,
      completed: subtaskStatus === "completed",
      effortHours: subtaskEffortEnabled
        ? parseEffortInput(subtaskEffortInput) ?? subtaskEffortHours
        : null,
      durationHours: subtaskDurationTotalHours,
      workingDays: subtaskCustomWorkingDays ? subtaskWorkingDaysConfig : null,
    }),
    [
      subtaskTitle,
      subtaskDescription,
      subtaskPriority,
      subtaskStatus,
      subtaskStartDate,
      subtaskDueDate,
      subtaskAssigneeIds,
      subtaskEffortEnabled,
      subtaskEffortInput,
      subtaskEffortHours,
      subtaskDurationTotalHours,
      subtaskCustomWorkingDays,
      subtaskWorkingDaysConfig,
    ]
  );

  const subtaskSignature = useMemo(
    () => JSON.stringify(buildSubtaskPayload()),
    [buildSubtaskPayload]
  );
  subtaskSignatureRef.current = subtaskSignature;

  const saveSubtask = async ({ closeOnSave = true }: { closeOnSave?: boolean } = {}) => {
    if (!activeSubtask || !canEdit || subtaskSaving) return;
    setSubtaskSaving(true);
    setMessage("");
    let res: Response;
    try {
      res = await authFetch(
        `/projects/${projectId}/tasks/${task._id}/subtasks/${activeSubtask._id}`,
        {
          method: "PUT",
          body: JSON.stringify(buildSubtaskPayload()),
        }
      );
    } catch {
      setSubtaskSaving(false);
      setMessage("Failed to save subtask");
      return;
    }

    if (res.ok) {
      const updated = await res.json();
      applyTaskUpdate(updated);
      savedSubtaskSigRef.current = subtaskSignature;
      setSubtaskSaving(false);
      if (closeOnSave) {
        // Back to the Kanban board — same as the main task's Save button.
        onClose();
      }
      return;
    }

    setSubtaskSaving(false);
    const data = await res.json().catch(() => ({}));
    setMessage(data.message || "Failed to save subtask");
  };

  // Schedule box "Save date" confirms the local selection and closes the
  // popover. Persistence goes through the footer "Save changes" button so
  // that button stays enabled (and working-days edits are included) until
  // the user explicitly saves the whole task/subtask.
  const confirmScheduleSelection = () => {
    if (!canEdit) return;
    setScheduleCalendarOpen(false);
    setDateSaveMsg("Click Save changes to apply");
    window.setTimeout(() => setDateSaveMsg(""), 2500);
  };

  // Only subtasks still use an explicit Save button; the main task autosaves.
  const handleSave = async () => {
    await saveSubtask();
  };

  const sendComment = async () => {
    const body = chatInput.trim();
    if ((!body && pendingChatFiles.length === 0) || sendingComment) return;

    const mentionIds = members
      .filter((m) => isUserMentionedInText(body, m.user.username))
      .map((m) => m.user._id);

    setSendingComment(true);
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          body,
          mentions: mentionIds,
          attachmentIds: pendingChatFiles.map((f) => f.id),
          subtaskId: activeSubtaskId || undefined,
        }),
      }
    );
    setSendingComment(false);

    if (res.ok) {
      await loadActivity();
      setChatInput("");
      setPendingChatFiles([]);
      setMentionOpen(false);
    }
  };

  const canEditComment = (item: TaskActivityComment) =>
    !!currentUser?._id &&
    item.author?._id === currentUser._id &&
    nowTick - new Date(item.createdAt).getTime() <= COMMENT_EDIT_WINDOW_MS;

  const startEditComment = (item: TaskActivityComment) => {
    setEditingCommentId(item.id);
    setEditingCommentBody(item.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentBody("");
  };

  const saveEditComment = async (commentId: string) => {
    const text = editingCommentBody.trim();
    if (!text || savingCommentEdit) return;

    setSavingCommentEdit(true);
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/comments/${commentId}`,
      { method: "PUT", body: JSON.stringify({ body: text }) }
    );
    setSavingCommentEdit(false);

    if (res.ok) {
      cancelEditComment();
      await loadActivity();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "Failed to update comment");
    }
  };

  // Builds the exact body we PUT to the server. Shared by the footer "Save
  // changes" button, the debounced autosave, and the "Save date" button so
  // they can never drift apart.
  const buildTaskPayload = useCallback(() => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const parsedDuration = parseDurationInput(durationInput);
    const hoursToSave = parsedDuration?.totalHours ?? durationTotalHours;
    const effortToSave = effortEnabled
      ? parseEffortInput(effortInput) ?? effortHours
      : null;

    return {
      title: title.trim(),
      description: normalizeDescriptionHtml(description),
      status,
      priority,
      assignees: assigneeIds,
      startDate: startDate || null,
      dueDate: dueDate || null,
      durationHours: hoursToSave,
      effortHours: effortToSave,
      workingDays: customWorkingDays ? workingDaysConfig : null,
      tags,
    };
  }, [
    tagsInput,
    durationInput,
    durationTotalHours,
    effortEnabled,
    effortInput,
    effortHours,
    title,
    description,
    status,
    priority,
    assigneeIds,
    startDate,
    dueDate,
    customWorkingDays,
    workingDaysConfig,
  ]);

  // A serialized snapshot of the payload. When this differs from the baseline
  // (savedSignature) there are unsaved edits; when they match the task is saved.
  const taskSignature = useMemo(
    () => JSON.stringify(buildTaskPayload()),
    [buildTaskPayload]
  );
  taskSignatureRef.current = taskSignature;
  // dirtyEpoch is only a re-render trigger after subtask hydration; the value
  // itself is unused beyond forcing this expression to re-run.
  void dirtyEpoch;
  const hasUnsavedChanges = isSubtaskView
    ? !hydratingSubtaskIdRef.current &&
      subtaskSignature !== savedSubtaskSigRef.current
    : savedSignature !== null &&
      !hydratingTaskIdRef.current &&
      taskSignature !== savedSignature;

  // While hydrating after open, keep folding automatic field updates into the
  // baseline so Close never asks to discard on an untouched task.
  useEffect(() => {
    if (hydratingTaskIdRef.current !== task._id) return;
    setSavedSignature(taskSignature);
  }, [task._id, taskSignature]);

  useEffect(() => {
    if (hydratingTaskIdRef.current !== task._id) return;
    const timer = window.setTimeout(() => {
      if (hydratingTaskIdRef.current !== task._id) return;
      setSavedSignature(taskSignatureRef.current);
      hydratingTaskIdRef.current = null;
    }, 300);
    return () => clearTimeout(timer);
  }, [task._id]);

  useEffect(() => {
    if (!activeSubtaskId || hydratingSubtaskIdRef.current !== activeSubtaskId) {
      return;
    }
    savedSubtaskSigRef.current = subtaskSignature;
  }, [activeSubtaskId, subtaskSignature]);

  useEffect(() => {
    if (!activeSubtaskId || hydratingSubtaskIdRef.current !== activeSubtaskId) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (hydratingSubtaskIdRef.current !== activeSubtaskId) return;
      savedSubtaskSigRef.current = subtaskSignatureRef.current;
      hydratingSubtaskIdRef.current = null;
      setDirtyEpoch((n) => n + 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [activeSubtaskId]);

  // Single low-level persist. Returns ok + optional API message. Does NOT
  // close the dialog or flip UI flags — callers decide toast / close behavior.
  const putTask = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`, {
      method: "PUT",
      body: JSON.stringify(buildTaskPayload()),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { message?: string }));
      return {
        ok: false,
        message: data.message || "Couldn't save changes.",
      };
    }
    const updated = await res.json();
    onUpdated(updated);
    return { ok: true };
  }, [projectId, task._id, buildTaskPayload, onUpdated]);

  const ASSIGNEE_ON_LEAVE_MSG = "Assignee is on leave for the selected date.";

  /** True when a selected assignee is on approved leave for the due date. */
  const hasAssigneeOnLeave = useCallback(() => {
    const ids = isSubtaskView ? subtaskAssigneeIds : assigneeIds;
    if (!activeDueDateForLeaveCheck || ids.length === 0) return false;
    return ids.some((id) => onLeaveUserIds.has(id));
  }, [
    isSubtaskView,
    subtaskAssigneeIds,
    assigneeIds,
    activeDueDateForLeaveCheck,
    onLeaveUserIds,
  ]);

  /**
   * Hard-block only when newly adding someone who is on leave.
   * Changing the due date with an existing assignee on leave must still save.
   */
  const hasNewAssigneeOnLeave = useCallback(() => {
    const ids = isSubtaskView ? subtaskAssigneeIds : assigneeIds;
    if (!activeDueDateForLeaveCheck || ids.length === 0) return false;

    let savedIds: string[] = [];
    try {
      const baseline = JSON.parse(
        (isSubtaskView ? savedSubtaskSigRef.current : savedSignature) || "{}"
      );
      savedIds = Array.isArray(baseline.assignees)
        ? baseline.assignees.map(String)
        : [];
    } catch {
      savedIds = [];
    }
    const saved = new Set(savedIds);
    return ids.some((id) => onLeaveUserIds.has(id) && !saved.has(id));
  }, [
    isSubtaskView,
    subtaskAssigneeIds,
    assigneeIds,
    activeDueDateForLeaveCheck,
    onLeaveUserIds,
    savedSignature,
  ]);

  // Explicit "Save changes" button for the main task — no more autosave.
  const handleSaveTask = async () => {
    if (!canEdit || taskSaving || !title.trim()) return;

    if (hasNewAssigneeOnLeave()) {
      toast.error(ASSIGNEE_ON_LEAVE_MSG);
      return;
    }

    setTaskSaving(true);
    setTaskSaveMsg("");
    const result = await putTask();
    if (result.ok) {
      setSavedSignature(taskSignature);
      // Back to the Kanban board — nothing else to do here once it's saved.
      onClose();
      return;
    }
    setTaskSaving(false);
    toast.error(result.message || "Couldn't save changes.");
    setTaskSaveMsg("");
  };

  // Closing with unsaved edits asks first instead of silently discarding —
    // there's no autosave to fall back on anymore.
  const handleClose = async () => {
    if (canEdit && hasUnsavedChanges) {
      const discard = await confirmDialog({
        title: "Discard unsaved changes?",
        description: "You have unsaved edits on this task. Close without saving?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

  // Task/subtask baselining happens in the open + hydration effects above so
  // automatic duration sync and rich-text empty placeholders never trigger
  // the "unsaved changes?" prompt on a freshly opened, untouched task.

  // Merge rather than replace wholesale — if two uploads are in flight at
  // once (e.g. multiple clipboard items from one paste), whichever response
  // lands last must not drop an attachment the other one just added; each
  // response's list is authoritative as of its own request, so union them
  // by _id instead of overwriting.
  const mergeAttachments = (incoming: TaskAttachment[]) => {
    setAttachments((prev) => {
      const byId = new Map(prev.map((a) => [a._id, a]));
      for (const a of incoming) byId.set(a._id, a);
      return Array.from(byId.values());
    });
  };

  const uploadAttachmentFile = async (file: File) => {
    if (!canEdit) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/attachments`,
      { method: "POST", body: formData }
    );
    setUploading(false);
    if (res.ok) {
      const updated = await res.json();
      mergeAttachments(updated.attachments || []);
      onUpdated(updated);
      await loadActivity();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "Upload failed");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAttachmentFile(file);
  };

  // Ctrl+V anywhere in the open task dialog attaches a pasted/copied image
  // directly — no need to open the file picker or even switch to the
  // Attachments tab first. Document-level so it fires regardless of which
  // tab is showing; skipped when the paste lands in a text-editable target
  // (Description editor, comment box, any input/textarea) so it doesn't
  // steal those elements' own paste behavior. Uses uploadDescriptionAttachment
  // (not the plain uploadAttachmentFile) so a pasted image behaves exactly
  // like the Description toolbar's "Attach image" button — shown inline
  // below Description on the Details tab *and* listed under Attachments,
  // instead of only the latter.
  useEffect(() => {
    if (isSubtaskView || !canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], .jodit-wysiwyg')) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      // Only the first image item — some OS clipboards (Windows in
      // particular) expose one copied screenshot under several MIME
      // representations (e.g. both image/png and image/bmp), which would
      // otherwise attach the same paste twice.
      let file: File | null = null;
      for (let i = 0; i < items.length && !file; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          file = item.getAsFile();
        }
      }
      if (!file) return;
      e.preventDefault();
      uploadDescriptionAttachment(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubtaskView, canEdit, projectId, task._id]);

  const removeAttachment = async (attachmentId: string) => {
    if (!canEdit) return;
    const res = await authFetch(
      `/projects/${projectId}/tasks/${task._id}/attachments/${attachmentId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const updated = await res.json();
      setAttachments(updated.attachments || []);
      onUpdated(updated);
      await loadActivity();
    }
  };

  const closeAttachmentPreview = () => {
    setAttachmentPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const fetchAttachmentBlob = async (
    attachmentId: string,
    options?: { inline?: boolean }
  ) => {
    const token = localStorage.getItem("token");
    const qs = options?.inline ? "?inline=1" : "";
    const res = await fetch(
      apiUrl(
        `/projects/${projectId}/tasks/${task._id}/attachments/${attachmentId}${qs}`
      ),
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { message?: string }).message ||
          (res.status === 403
            ? "You do not have permission to open this file"
            : "Could not open attachment")
      );
    }
    return res.blob();
  };

  // Re-hydrate the Description image thumbnails from persisted attachments
  // (flagged `inDescription` on upload) whenever the task's attachment list
  // changes — e.g. on first load/reopen — so pasted images survive a reload
  // instead of only living in the in-memory preview list for the session.
  useEffect(() => {
    const imageAttachments = attachments.filter(
      (a) => a.inDescription && a.mimeType?.startsWith("image/")
    );
    const validIds = new Set(imageAttachments.map((a) => a._id));

    setDescriptionImagePreviews((prev) => {
      const stale = prev.filter(
        (p) => !p.id.startsWith("temp-") && !validIds.has(p.id)
      );
      if (stale.length === 0) return prev;
      stale.forEach((p) => URL.revokeObjectURL(p.url));
      return prev.filter((p) => p.id.startsWith("temp-") || validIds.has(p.id));
    });

    const existingIds = new Set(descriptionImagePreviews.map((p) => p.id));
    const missing = imageAttachments.filter((a) => !existingIds.has(a._id));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const a of missing) {
        try {
          const blob = await fetchAttachmentBlob(a._id, { inline: true });
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setDescriptionImagePreviews((prev) =>
            prev.some((p) => p.id === a._id)
              ? prev
              : [...prev, { id: a._id, url, name: a.originalName }]
          );
        } catch {
          // Skip attachments that fail to load (e.g. a transient network
          // error) — the rest of the description still renders normally.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  const downloadAttachment = async (
    attachmentId: string,
    originalName: string
  ) => {
    try {
      const blob = await fetchAttachmentBlob(attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not download attachment"
      );
    }
  };

  const viewAttachment = async (
    attachmentId: string,
    originalName: string,
    mimeType?: string
  ) => {
    const kind = getAttachmentPreviewKind(mimeType, originalName);
    try {
      const blob = await fetchAttachmentBlob(attachmentId, { inline: true });
      const typedBlob = new Blob([blob], {
        type:
          kind === "pdf"
            ? "application/pdf"
            : blob.type || mimeType || "application/octet-stream",
      });
      const url = URL.createObjectURL(typedBlob);

      if (kind) {
        setAttachmentPreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { url, name: originalName, kind };
        });
        return;
      }

      // Non-previewable types: open in a new tab when possible, else download
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = originalName;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not open attachment"
      );
    }
  };

  const deleteTask = async () => {
    if (!canEdit) return;
    const ok = await confirmDialog({
      title: "Move this task to trash?",
      description: "You can restore it later from Trash.",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (res.ok) {
      onDeleted(task._id);
      onClose();
    }
  };

  const inputClass = "field-input text-sm disabled:opacity-60";
  // Textareas need a flexible height, so this mirrors .field-input's look
  // (surface/border/focus treatment) via utilities rather than the fixed-
  // height .field-input class itself.
  const textareaClass =
    "w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20";
  const labelClass =
    "block text-xs font-medium text-slate-500 mb-1.5 dark:text-slate-400";
  // Mirrors .field-input's box (height, radius, border) for the custom Select
  // trigger, since that class only targets native inputs/textareas.
  const fieldSelectTriggerClass = (open: boolean) =>
    `flex items-center justify-between gap-2 w-full h-10 px-3.5 rounded-[14px] border bg-white text-sm text-slate-900 outline-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed dark:bg-slate-800 dark:text-slate-100 ${
      open
        ? "border-cyan-500 ring-4 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
    }`;

  return (
    <ModalShell onClose={handleClose} maxWidth="5xl" className="flex h-[94vh] max-h-[94vh] flex-col overflow-hidden">
      <style>{`
        .task-detail-thin-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(103, 232, 249, 0.28) transparent;
        }
        .task-detail-thin-scroll::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .task-detail-thin-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .task-detail-thin-scroll::-webkit-scrollbar-thumb {
          background: rgba(103, 232, 249, 0.28);
          border-radius: 999px;
        }
        .task-detail-thin-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(103, 232, 249, 0.45);
        }
        .task-wrike-calendar .rdp-root {
          --rdp-accent-color: rgba(6, 182, 212, 0.45);
          --rdp-accent-background-color: rgba(6, 182, 212, 0.08);
          --rdp-months-gap: 0.5rem;
          color: #334155;
          width: fit-content;
          max-width: 100%;
        }
        .task-wrike-calendar .rdp-months {
          display: flex;
          flex-direction: row;
          gap: 0.5rem;
          flex-wrap: nowrap;
          justify-content: flex-start;
          width: fit-content;
          max-width: 100%;
        }
        .task-wrike-calendar .rdp-month {
          flex: 0 0 auto;
          width: auto;
        }
        .task-wrike-calendar .rdp-month_caption {
          color: #64748b;
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }
        .task-wrike-calendar .rdp-weekday {
          color: #64748b;
          font-size: 0.7rem;
        }
        .task-wrike-calendar .rdp-day_button {
          color: #334155;
          border-radius: 0.5rem;
          width: 2.25rem;
          height: 2.25rem;
          background: transparent;
        }
        .task-wrike-calendar .rdp-day_button:hover {
          background: rgba(148, 163, 184, 0.15);
          color: #1e293b;
        }
        .task-wrike-calendar .rdp-today .rdp-day_button {
          border: 1px solid rgba(6, 182, 212, 0.4);
          background: rgba(6, 182, 212, 0.06);
        }
        .task-wrike-calendar .rdp-range_start .rdp-day_button {
          background: rgba(6, 182, 212, 0.18);
          color: #0e7490;
          border-radius: 0.5rem 0 0 0.5rem;
        }
        .task-wrike-calendar .rdp-range_end .rdp-day_button {
          background: rgba(196, 181, 253, 0.25);
          color: #6d28d9;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .task-wrike-calendar .rdp-range_middle .rdp-day_button {
          background: rgba(148, 163, 184, 0.12);
          color: #334155;
          border-radius: 0;
        }
        .task-wrike-calendar .rdp-selected .rdp-day_button {
          background: rgba(6, 182, 212, 0.15);
          color: #0e7490;
        }
        .task-wrike-calendar .rdp-preview .rdp-day_button {
          background: rgba(196, 181, 253, 0.15);
          color: #6d28d9;
        }
        .task-wrike-calendar .rdp-preview_end .rdp-day_button {
          background: rgba(196, 181, 253, 0.25);
          color: #581c87;
          box-shadow: inset 0 0 0 1px rgba(196, 181, 253, 0.4);
        }
        .task-wrike-calendar .rdp-chevron {
          fill: #64748b;
        }
        .task-wrike-calendar .rdp-outside .rdp-day_button {
          color: #94a3b8;
          opacity: 0.6;
        }
        .task-wrike-calendar .rdp-weekend .rdp-day_button {
          color: rgba(100, 116, 139, 0.55);
        }
        .task-wrike-calendar .rdp-weekend.rdp-range_middle .rdp-day_button,
        .task-wrike-calendar .rdp-weekend.rdp-range_start .rdp-day_button,
        .task-wrike-calendar .rdp-weekend.rdp-range_end .rdp-day_button {
          color: inherit;
        }
        .task-wrike-calendar .rdp-nav {
          position: relative;
        }

        /* Dark theme -- mirrors the light rules above with the same accent
           hues, since the DayPicker's day-cell colors are plain CSS rather
           than Tailwind utility classes and can't take a dark-variant prefix. */
        .dark .task-wrike-calendar .rdp-root {
          color: #cbd5e1;
        }
        .dark .task-wrike-calendar .rdp-month_caption {
          color: #94a3b8;
        }
        .dark .task-wrike-calendar .rdp-weekday {
          color: #94a3b8;
        }
        .dark .task-wrike-calendar .rdp-day_button {
          color: #cbd5e1;
        }
        .dark .task-wrike-calendar .rdp-day_button:hover {
          background: rgba(148, 163, 184, 0.15);
          color: #f1f5f9;
        }
        .dark .task-wrike-calendar .rdp-today .rdp-day_button {
          border: 1px solid rgba(34, 211, 238, 0.4);
          background: rgba(34, 211, 238, 0.08);
        }
        .dark .task-wrike-calendar .rdp-range_start .rdp-day_button {
          background: rgba(34, 211, 238, 0.22);
          color: #67e8f9;
          border-radius: 0.5rem 0 0 0.5rem;
        }
        .dark .task-wrike-calendar .rdp-range_end .rdp-day_button {
          background: rgba(196, 181, 253, 0.25);
          color: #c4b5fd;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .dark .task-wrike-calendar .rdp-range_middle .rdp-day_button {
          background: rgba(148, 163, 184, 0.14);
          color: #cbd5e1;
          border-radius: 0;
        }
        .dark .task-wrike-calendar .rdp-selected .rdp-day_button {
          background: rgba(34, 211, 238, 0.18);
          color: #67e8f9;
        }
        .dark .task-wrike-calendar .rdp-preview .rdp-day_button {
          background: rgba(196, 181, 253, 0.16);
          color: #c4b5fd;
        }
        .dark .task-wrike-calendar .rdp-preview_end .rdp-day_button {
          background: rgba(196, 181, 253, 0.28);
          color: #ddd6fe;
          box-shadow: inset 0 0 0 1px rgba(196, 181, 253, 0.4);
        }
        .dark .task-wrike-calendar .rdp-chevron {
          fill: #94a3b8;
        }
        .dark .task-wrike-calendar .rdp-outside .rdp-day_button {
          color: #64748b;
          opacity: 0.6;
        }
        .dark .task-wrike-calendar .rdp-weekend .rdp-day_button {
          color: rgba(148, 163, 184, 0.55);
        }
        .dark .task-wrike-calendar .rdp-weekend.rdp-range_middle .rdp-day_button,
        .dark .task-wrike-calendar .rdp-weekend.rdp-range_start .rdp-day_button,
        .dark .task-wrike-calendar .rdp-weekend.rdp-range_end .rdp-day_button {
          color: inherit;
        }
      `}</style>

        {/* Toolbar header — 
         (subtask view), document-style title, share + close */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              {isSubtaskView ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-2 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 uppercase tracking-wide text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    Subtask
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  {/* Root task */}
                  <button
                    type="button"
                    onClick={() => onNavigateParent?.()}
                    className="text-cyan-700 hover:text-cyan-600 truncate max-w-[160px] text-left font-medium dark:text-cyan-400 dark:hover:text-cyan-300"
                    title={`Back to task: ${task.title}`}
                  >
                    {task.title || "Untitled task"}
                  </button>
                  {/* Intermediate ancestors (level-2/3 nesting) */}
                  {greatGrandparentSubtask ? (
                    <>
                      <ChevronRight size={13} className="text-slate-400 shrink-0 dark:text-slate-500" />
                      <button
                        type="button"
                        onClick={() => onSubtaskOpen?.(greatGrandparentSubtask._id)}
                        className="text-cyan-700 hover:text-cyan-600 truncate max-w-[140px] text-left font-medium dark:text-cyan-400 dark:hover:text-cyan-300"
                        title={`Back to: ${greatGrandparentSubtask.title}`}
                      >
                        {greatGrandparentSubtask.title || "Untitled"}
                      </button>
                    </>
                  ) : null}
                  {activeSubtaskParent ? (
                    <>
                      <ChevronRight size={13} className="text-slate-400 shrink-0 dark:text-slate-500" />
                      <button
                        type="button"
                        onClick={() => onSubtaskOpen?.(activeSubtaskParent._id)}
                        className="text-cyan-700 hover:text-cyan-600 truncate max-w-[140px] text-left font-medium dark:text-cyan-400 dark:hover:text-cyan-300"
                        title={`Back to parent: ${activeSubtaskParent.title}`}
                      >
                        {activeSubtaskParent.title || "Untitled"}
                      </button>
                    </>
                  ) : null}
                  <ChevronRight size={13} className="text-slate-400 shrink-0 dark:text-slate-500" />
                  <span
                    className="text-slate-600 truncate max-w-[200px] dark:text-slate-300"
                    title={subtaskTitle || activeSubtask?.title || "Untitled"}
                  >
                    {subtaskTitle || activeSubtask?.title || "Untitled"}
                  </span>
                </div>
              ) : null}

              <input
                value={isSubtaskView ? subtaskTitle : title}
                onChange={(e) =>
                  isSubtaskView
                    ? setSubtaskTitle(e.target.value)
                    : setTitle(e.target.value)
                }
                disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                placeholder="Untitled task"
                className="w-full -ml-2 px-2 py-1 rounded-lg border border-transparent bg-transparent text-xl font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal transition-colors hover:border-slate-200 hover:bg-slate-50 focus:border-cyan-300 focus:bg-cyan-50/40 focus:outline-none disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:focus:border-cyan-500/50 dark:focus:bg-cyan-400/10"
                suppressHydrationWarning
              />

              
            </div>

            <div className="flex items-start gap-2 shrink-0 max-w-[min(100%,420px)]">
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 min-w-[200px] max-w-[340px] dark:bg-slate-800 dark:border-slate-700">
                <Link2 size={14} className="text-cyan-600/70 shrink-0 dark:text-cyan-400/70" />
                <span
                  className="text-[11px] text-slate-500 truncate flex-1 dark:text-slate-400"
                  title={shareUrl}
                >
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={copyShareUrl}
                  className="p-1 rounded hover:bg-slate-200/60 text-cyan-700 dark:text-cyan-400 dark:hover:bg-slate-700/60"
                  title="Copy link"
                >
                  <Copy size={14} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-ghost btn-sm !px-2"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <Select
              value={isSubtaskView ? subtaskStatus : status}
              onChange={(v) =>
                isSubtaskView ? setSubtaskStatus(v) : setStatus(v)
              }
              disabled={!canEdit || (isSubtaskView && subtaskSaving)}
              options={statusOptions}
              triggerClassName={(open) =>
                `inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  statusPillClasses(isSubtaskView ? subtaskStatus : status)
                    .pill
                } ${open ? "ring-2 ring-offset-1 ring-cyan-300 dark:ring-cyan-500/40 dark:ring-offset-slate-900" : ""}`
              }
              menuClassName="min-w-[180px]"
            />

            <Select
              value={isSubtaskView ? subtaskPriority : priority}
              onChange={(v) =>
                isSubtaskView ? setSubtaskPriority(v) : setPriority(v)
              }
              disabled={!canEdit || (isSubtaskView && subtaskSaving)}
              options={PRIORITY_OPTIONS}
              triggerClassName={(open) =>
                `inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${priorityPillClasses(
                  isSubtaskView ? subtaskPriority : priority
                )} ${open ? "ring-2 ring-offset-1 ring-cyan-300 dark:ring-cyan-500/40 dark:ring-offset-slate-900" : ""}`
              }
              menuClassName="min-w-[140px]"
            />

            <div className="flex flex-col gap-1" ref={assigneeFieldRef}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  Assignee
                </span>
                <AssigneePicker
                  members={members}
                  selectedIds={isSubtaskView ? subtaskAssigneeIds : assigneeIds}
                  onChange={isSubtaskView ? setSubtaskAssigneeIds : setAssigneeIds}
                  disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                  openSignal={assigneeOpenSignal}
                  onLeaveUserIds={onLeaveUserIds}
                  compact
                />
              </div>
              {hasAssigneeOnLeave() && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  {hasNewAssigneeOnLeave()
                    ? "A newly selected assignee is on leave for this due date. Remove them or pick another date to save."
                    : "An assignee is on leave for this due date. You can still save the schedule."}
                </p>
              )}
            </div>
          </div>

          <div className="sm:hidden mt-3 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 dark:bg-slate-800 dark:border-slate-700">
            <Link2 size={14} className="text-cyan-600/70 shrink-0 dark:text-cyan-400/70" />
            <span className="text-[11px] text-slate-500 truncate flex-1 dark:text-slate-400">{shareUrl}</span>
            <button
              type="button"
              onClick={copyShareUrl}
              className="p-1 rounded hover:bg-slate-200/60 text-cyan-700 dark:text-cyan-400 dark:hover:bg-slate-700/60"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>

        {/* Summary — assignees, tags, schedule, effort, progress. Always
            visible regardless of the active tab below (previously these
            lived inside the Details tab body). */}
        <div className="shrink-0 border-b border-slate-200 px-6 py-5 space-y-5 dark:border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch">
            {/* Schedule: compact summary card that opens a calendar popover */}
            <div className="relative flex items-center gap-3" ref={scheduleCalendarRef}>
              <SectionLabel icon={Calendar} tint="cyan" inline>Schedule</SectionLabel>
              <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setScheduleCalendarOpen((v) => !v)}
                className="w-full flex flex-col justify-center text-left rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-500/40"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 shrink-0 dark:text-slate-100">
                    {(isSubtaskView ? subtaskStartDate : startDate) &&
                    (isSubtaskView ? subtaskDueDate : dueDate)
                      ? `${format(
                          parseDateKey(isSubtaskView ? subtaskStartDate : startDate),
                          "MMM d"
                        )} – ${format(
                          parseDateKey(isSubtaskView ? subtaskDueDate : dueDate),
                          "d, yyyy"
                        )}`
                      : "Set schedule"}
                  </p>
                  <p className="text-xs text-slate-400 truncate dark:text-slate-500">
                    {(isSubtaskView ? subtaskActiveDurationDays : activeDurationDays)
                      ? `· ${isSubtaskView ? subtaskActiveDurationDays : activeDurationDays} working ${
                          (isSubtaskView ? subtaskActiveDurationDays : activeDurationDays) === 1
                            ? "day"
                            : "days"
                        }`
                      : "Click to choose dates"}
                  </p>
                </div>
              </button>
              {dateSaveMsg && !scheduleCalendarOpen && (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  {dateSaveMsg}
                </p>
              )}
              </div>

              {scheduleCalendarOpen && !isSubtaskView && (
                <div className="absolute left-0 top-full z-30 mt-2 w-max max-w-[95vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="task-wrike-calendar task-detail-thin-scroll rounded-xl overflow-x-auto">
                    <DayPicker
                      mode="range"
                      numberOfMonths={2}
                      pagedNavigation={false}
                      fixedWeeks
                      showOutsideDays
                      selected={range}
                      onSelect={syncDatesFromRange}
                      onDayMouseEnter={setHoverDate}
                      onDayMouseLeave={() => setHoverDate(undefined)}
                      modifiers={calendarModifiers}
                      modifiersClassNames={{
                        preview: "rdp-preview",
                        preview_end: "rdp-preview_end",
                        weekend: "rdp-weekend",
                      }}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={displayDurationValue}
                      onChange={(e) => applyDurationInput(e.target.value)}
                      onBlur={formatDurationOnBlur}
                      disabled={!canEdit || !startDate}
                      placeholder="Auto"
                      className="min-w-[3rem] flex-1 max-w-[9rem] py-1 px-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    />
                    {durationSuffix && (
                      <span className="text-xs text-slate-500 shrink-0 dark:text-slate-400">
                        {durationSuffix}
                      </span>
                    )}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={customWorkingDays}
                      onChange={(e) => handleWorkingDaysCheckbox(e.target.checked)}
                      disabled={!canEdit}
                      className="rounded border-slate-300 bg-white text-cyan-600 dark:border-slate-600 dark:bg-slate-800"
                    />
                    Customize working days
                  </label>
                  {customWorkingDays ? (
                    <button
                      type="button"
                      onClick={() => setWorkingDaysDialogOpen(true)}
                      className="mt-1 block text-left text-xs text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
                    >
                      Edit ({formatWorkingDaysSummary(workingDaysConfig)})
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Mon–Fri (default)</p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex items-center justify-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          confirmScheduleSelection();
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        Save date
                      </button>
                    </div>
                  )}
                </div>
              )}

              {scheduleCalendarOpen && isSubtaskView && (
                <div className="absolute left-0 top-full z-30 mt-2 w-max max-w-[95vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="task-wrike-calendar task-detail-thin-scroll rounded-xl overflow-x-auto">
                    <DayPicker
                      mode="range"
                      numberOfMonths={2}
                      pagedNavigation={false}
                      fixedWeeks
                      showOutsideDays
                      selected={subtaskRange}
                      onSelect={syncSubtaskDatesFromRange}
                      onDayMouseEnter={setSubtaskHoverDate}
                      onDayMouseLeave={() => setSubtaskHoverDate(undefined)}
                      modifiers={subtaskCalendarModifiers}
                      modifiersClassNames={{
                        preview: "rdp-preview",
                        preview_end: "rdp-preview_end",
                        weekend: "rdp-weekend",
                      }}
                      disabled={!canEdit || subtaskSaving}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={subtaskDisplayDurationValue}
                      onChange={(e) => applySubtaskDurationInput(e.target.value)}
                      onBlur={formatSubtaskDurationOnBlur}
                      disabled={!canEdit || !subtaskStartDate || subtaskSaving}
                      placeholder="Auto"
                      className="min-w-[3rem] flex-1 max-w-[9rem] py-1 px-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    />
                    {subtaskDurationSuffix && (
                      <span className="text-xs text-slate-500 shrink-0 dark:text-slate-400">
                        {subtaskDurationSuffix}
                      </span>
                    )}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={subtaskCustomWorkingDays}
                      onChange={(e) => handleSubtaskWorkingDaysCheckbox(e.target.checked)}
                      disabled={!canEdit || subtaskSaving}
                      className="rounded border-slate-300 bg-white text-cyan-600 dark:border-slate-600 dark:bg-slate-800"
                    />
                    Customize working days
                  </label>
                  {subtaskCustomWorkingDays ? (
                    <button
                      type="button"
                      onClick={() => setWorkingDaysDialogOpen(true)}
                      className="mt-1 block text-left text-xs text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
                    >
                      Edit ({formatWorkingDaysSummary(subtaskWorkingDaysConfig)})
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Mon–Fri (default)</p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex items-center justify-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          confirmScheduleSelection();
                        }}
                        disabled={subtaskSaving}
                        className="btn btn-primary btn-sm"
                      >
                        Save date
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Effort */}
            <div className="flex items-center gap-3">
              <SectionLabel icon={Clock} tint="emerald" inline>Effort</SectionLabel>
              <div className="flex-1 min-w-0 flex flex-col justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  {(isSubtaskView ? subtaskEffortEnabled : effortEnabled) ? (
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={isSubtaskView ? subtaskEffortInput : effortInput}
                        onChange={(e) =>
                          isSubtaskView
                            ? applySubtaskEffortInput(e.target.value)
                            : applyEffortInput(e.target.value)
                        }
                        onBlur={isSubtaskView ? formatSubtaskEffortOnBlur : formatEffortOnBlur}
                        disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                        placeholder="40"
                        aria-label="Effort hours"
                        className="w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 placeholder:font-normal hover:border-slate-300 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:focus:border-cyan-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20"
                      />
                      <span className="text-sm text-slate-500 shrink-0 dark:text-slate-400">
                        h total
                      </span>
                      {(isSubtaskView ? subtaskActiveDurationDays : activeDurationDays) &&
                      (isSubtaskView ? subtaskEffortHours : effortHours) ? (
                        <span className="text-xs text-slate-400 truncate dark:text-slate-500">
                          · ~
                          {formatHoursPerDay(
                            (isSubtaskView ? subtaskEffortHours : effortHours) || 0,
                            (isSubtaskView
                              ? subtaskActiveDurationDays
                              : activeDurationDays) || 1
                          )}{" "}
                          / day
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No effort set</p>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isSubtaskView ? subtaskEffortEnabled : effortEnabled}
                    disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                    onClick={() =>
                      isSubtaskView
                        ? handleSubtaskEffortToggle(!subtaskEffortEnabled)
                        : handleEffortToggle(!effortEnabled)
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                      (isSubtaskView ? subtaskEffortEnabled : effortEnabled)
                        ? "bg-emerald-100 border-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/30"
                        : "bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 dark:bg-slate-200 ${
                        (isSubtaskView ? subtaskEffortEnabled : effortEnabled)
                          ? "translate-x-[1.4rem]"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 border-b border-slate-200 px-6 flex items-center gap-1 overflow-hidden dark:border-slate-800">
          {(
            [
              { id: "details" as const, label: "Details", count: 0 },
              // A subtask at the maximum nesting level can't have children
              // of its own, so there's nothing for its Subtasks tab to show.
              ...(!isSubtaskView || (activeSubtask && subtaskLevelOf(activeSubtask, subtasks) < MAX_SUBTASK_LEVEL)
                ? [
                    {
                      id: "subtasks" as const,
                      label: "Subtasks",
                      count: isSubtaskView
                        ? subtasks.filter((s) => s.parentSubtaskId === activeSubtaskId).length
                        : subtasks.filter((s) => !s.parentSubtaskId).length,
                    },
                  ]
                : []),
              ...(!isSubtaskView
                ? [{ id: "attachments" as const, label: "Attachments", count: attachments.length }]
                : []),
              { id: "activity" as const, label: "Activity", count: activityFeed.length },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-cyan-500 text-cyan-700 dark:text-cyan-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-700"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 ${
                    activeTab === tab.id
                      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto task-detail-thin-scroll px-6 py-5">
        <div className="space-y-6 flex flex-col h-full">
          {activeTab === "details" && (
          <div className="flex-1 flex flex-col min-h-0">
            <SectionLabel>Description</SectionLabel>
            <div className="flex-1 flex flex-col min-h-[132px] rounded-xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-cyan-400 focus-within:bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-cyan-500 dark:focus-within:bg-slate-800">
              {showDescriptionEditor && !isSubtaskView && (
                <div className="shrink-0 flex items-center justify-end gap-1 px-2 py-1.5 border-b border-slate-200/80 dark:border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => descriptionFileRef.current?.click()}
                    disabled={descriptionUploading || !canEdit}
                    className="btn btn-ghost btn-sm !h-7 !w-7 !px-0 hover:text-cyan-700 disabled:opacity-40 dark:hover:text-cyan-400"
                    title="Attach image"
                  >
                    <Paperclip size={14} />
                  </button>
                  <input
                    ref={descriptionFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadDescriptionAttachment(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              {showDescriptionEditor ? (
                <div className="relative z-0 flex-1 min-h-[100px] min-w-0 overflow-hidden">
                  <JoditDescriptionEditor
                    value={activeDescriptionValue}
                    onChange={(html) =>
                      isSubtaskView ? setSubtaskDescription(html) : setDescription(html)
                    }
                    disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                    placeholder="Add a description..."
                  />
                </div>
              ) : activeDescriptionValue ? (
                <div
                  className={DESCRIPTION_READ_VIEW_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(activeDescriptionValue),
                  }}
                />
              ) : (
                <div className={DESCRIPTION_READ_VIEW_CLASS}>
                  <span className="text-slate-400 dark:text-slate-500">
                    Add a description...
                  </span>
                </div>
              )}
              {!isSubtaskView && descriptionImagePreviews.length > 0 && (
                <div className="relative z-10 shrink-0 clear-both flex flex-wrap gap-2 px-3 py-2.5 border-t border-slate-200/80 bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800/80">
                  {descriptionImagePreviews.map((img) => (
                    <div key={img.id} className="group relative shrink-0">
                      <img
                        src={img.url}
                        alt={img.name}
                        onClick={() =>
                          !img.id.startsWith("temp-") &&
                          viewAttachment(img.id, img.name, "image/*")
                        }
                        className={`h-16 w-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 ${
                          img.id.startsWith("temp-") ? "" : "cursor-pointer hover:opacity-90"
                        }`}
                        title={img.id.startsWith("temp-") ? undefined : "Click to expand"}
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeDescriptionImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 hidden h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-700 text-white group-hover:flex dark:bg-slate-600"
                          title="Remove image"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {isSubtaskView && activeTab === "subtasks" && activeSubtask && (() => {
            const level = subtaskLevelOf(activeSubtask, subtasks);
            const children = subtasks.filter(
              (s) => s.parentSubtaskId === activeSubtask._id
            );
            const canAddChild = level < MAX_SUBTASK_LEVEL;
            return (
              <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 overflow-hidden bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <CheckSquare size={15} className="text-cyan-600/80 dark:text-cyan-400/80" />
                  <span className="font-medium">
                    {children.length}{" "}
                    {children.length === 1 ? "subitem" : "subitems"}
                  </span>
                </div>

                {children.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      No subitems yet — add one below.
                    </p>
                  </div>
                )}

                {children.length > 0 && (
                  <ul className="flex-1 min-h-0 overflow-auto task-detail-thin-scroll divide-y divide-slate-100 dark:divide-slate-800">
                    {children.map((child) => {
                      const statusId = resolveSubtaskStatus(child);
                      const statusStyle = statusPillClasses(statusId);
                      const done = isSubtaskDone(child);
                      return (
                        <li
                          key={child._id}
                          onClick={() => onSubtaskOpen?.(child._id)}
                          className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                        >
                          <FileText size={14} className="text-cyan-500/60 shrink-0 dark:text-cyan-400/60" />
                          <span
                            className={`flex-1 min-w-0 truncate text-sm ${
                              done
                                ? "line-through text-slate-400 dark:text-slate-500"
                                : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {child.title}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border shrink-0 ${statusStyle.pill}`}
                          >
                            <span className={`w-0.5 h-3.5 rounded-full ${statusStyle.bar}`} />
                            {statusLabelFor(statusId)}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteSubtask(child._id, child.title);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                              title="Delete subtask"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canEdit && canAddChild && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 dark:bg-slate-800 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center rounded-lg border border-cyan-200 focus-within:border-cyan-400 bg-white overflow-hidden dark:border-cyan-500/30 dark:focus-within:border-cyan-500 dark:bg-slate-900">
                        <input
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addSubtask(activeSubtask._id);
                            }
                          }}
                          placeholder="Add a subtask..."
                          disabled={subtaskSaving}
                          className="flex-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => addSubtask(activeSubtask._id)}
                        disabled={!newSubtaskTitle.trim() || subtaskSaving}
                        className="p-2 rounded-lg text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
                        title="Add subtask"
                      >
                        <CornerDownLeft size={18} />
                      </button>
                    </div>
                  </div>
                )}
                {canEdit && !canAddChild && (
                  <p className="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800 dark:text-slate-500">
                    Maximum subtask nesting depth reached.
                  </p>
                )}
              </div>
            );
          })()}

          {!isSubtaskView && activeTab === "subtasks" && (() => {
          const topLevelSubtasks = subtasks.filter((s) => !s.parentSubtaskId);
          return (
          <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 overflow-hidden bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <CheckSquare size={15} className="text-cyan-600/80 dark:text-cyan-400/80" />
                <span className="font-medium">
                  {topLevelSubtasks.length}{" "}
                  {topLevelSubtasks.length === 1 ? "subitem" : "subitems"}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto task-detail-thin-scroll">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                    <th className="px-4 py-2.5 font-medium w-[30%]">Name</th>
                    <th className="px-3 py-2.5 font-medium w-[13%]">Status</th>
                    <th className="px-3 py-2.5 font-medium w-[16%]">Assignee</th>
                    <th className="px-3 py-2.5 font-medium w-[15%]">Start date</th>
                    <th className="px-3 py-2.5 font-medium w-[15%]">Due date</th>
                    <th className="px-3 py-2.5 font-medium w-[11%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topLevelSubtasks.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                      >
                        No subitems yet — add one below.
                      </td>
                    </tr>
                  )}
                  {topLevelSubtasks.map((subtask) => {
                    const isActive = activeSubtaskId === subtask._id;
                    const assigneeLabel =
                      assigneeLabelsFromTask(subtask) || "";
                    const statusId = resolveSubtaskStatus(subtask);
                    const statusStyle = statusPillClasses(statusId);
                    const done = isSubtaskDone(subtask);
                    return (
                      <tr
                        key={subtask._id}
                        onClick={() => onSubtaskOpen?.(subtask._id)}
                        className={`border-b border-slate-200 cursor-pointer transition dark:border-slate-800 ${
                          isActive
                            ? "bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/15"
                            : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText
                              size={14}
                              className="text-cyan-500/60 shrink-0 dark:text-cyan-400/60"
                            />
                            <span
                              className={`truncate ${
                                done
                                  ? "line-through text-slate-400 dark:text-slate-500"
                                  : "text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {subtask.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${statusStyle.pill}`}
                          >
                            <span
                              className={`w-0.5 h-3.5 rounded-full ${statusStyle.bar}`}
                            />
                            {statusLabelFor(statusId)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 truncate dark:text-slate-400">
                          {assigneeLabel || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap dark:text-slate-400">
                          {formatTableDate(subtask.startDate)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap dark:text-slate-400">
                          {formatTableDate(subtask.dueDate)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteSubtask(subtask._id, subtask.title);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                              title="Delete subtask"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="shrink-0 px-4 py-3 bg-slate-50 border-t border-slate-200 dark:bg-slate-800 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center rounded-lg border border-cyan-200 focus-within:border-cyan-400 bg-white overflow-hidden dark:border-cyan-500/30 dark:focus-within:border-cyan-500 dark:bg-slate-900">
                    <input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubtask();
                        }
                      }}
                      placeholder="Enter name or paste a link"
                      disabled={subtaskSaving}
                      className="flex-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 mr-1 text-xs text-slate-500 border border-slate-200 rounded-md bg-slate-50 dark:text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                      <FileText size={12} />
                      Task
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => addSubtask()}
                    disabled={!newSubtaskTitle.trim() || subtaskSaving}
                    className="p-2 rounded-lg text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
                    title="Add subtask"
                  >
                    <CornerDownLeft size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
          );
          })()}

          {!isSubtaskView && activeTab === "attachments" && (
          <div>
            <SectionLabel
              icon={Paperclip}
              action={
                canEdit && (
                  <label className="flex items-center gap-1.5 text-xs font-medium text-cyan-700 cursor-pointer hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300">
                    <Paperclip size={13} />
                    {uploading ? "Uploading..." : "Add file"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                )
              }
            >
              Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
            </SectionLabel>
            {attachments.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl dark:text-slate-400 dark:border-slate-700">
                No attachments yet
              </p>
            ) : (
              <ul className="space-y-1.5">
                {attachments.map((file) => (
                  <li
                    key={file._id}
                    className="group flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 shrink-0 dark:bg-cyan-400/10 dark:text-cyan-400">
                        <Paperclip size={14} />
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            viewAttachment(
                              file._id,
                              file.originalName,
                              file.mimeType
                            )
                          }
                          className="text-sm text-slate-800 truncate dark:text-slate-100 hover:text-cyan-700 dark:hover:text-cyan-300 text-left max-w-full"
                          title="View attachment"
                        >
                          {file.originalName}
                        </button>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          viewAttachment(
                            file._id,
                            file.originalName,
                            file.mimeType
                          )
                        }
                        className="btn btn-ghost btn-sm !h-8 !w-8 !px-0 text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300"
                        title="View"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadAttachment(file._id, file.originalName)
                        }
                        className="btn btn-ghost btn-sm !h-8 !w-8 !px-0 text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300"
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(file._id)}
                          className="btn btn-ghost btn-sm !h-8 !w-8 !px-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}

          {activeTab === "activity" && (
          <div className="space-y-4">
          {/* Same description field/state as the Details tab — editing it
              here or there updates the same task, live in both places. */}
          <div>
            <SectionLabel>Description</SectionLabel>
            <div className="rounded-xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-cyan-400 focus-within:bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-cyan-500 dark:focus-within:bg-slate-800">
              {showDescriptionEditor && !isSubtaskView && (
                <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-slate-200/80 dark:border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => descriptionFileRef.current?.click()}
                    disabled={descriptionUploading || !canEdit}
                    className="btn btn-ghost btn-sm !h-7 !w-7 !px-0 hover:text-cyan-700 disabled:opacity-40 dark:hover:text-cyan-400"
                    title="Attach image"
                  >
                    <Paperclip size={14} />
                  </button>
                  <input
                    ref={descriptionFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadDescriptionAttachment(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              {showDescriptionEditor ? (
                <div className="relative z-0 min-h-[100px] min-w-0 overflow-hidden">
                  <JoditDescriptionEditor
                    value={activeDescriptionValue}
                    onChange={(html) =>
                      isSubtaskView ? setSubtaskDescription(html) : setDescription(html)
                    }
                    disabled={!canEdit || (isSubtaskView && subtaskSaving)}
                    placeholder="Add a description..."
                  />
                </div>
              ) : activeDescriptionValue ? (
                <div
                  className={DESCRIPTION_READ_VIEW_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(activeDescriptionValue),
                  }}
                />
              ) : (
                <div className={DESCRIPTION_READ_VIEW_CLASS}>
                  <span className="text-slate-400 dark:text-slate-500">
                    Add a description...
                  </span>
                </div>
              )}
              {!isSubtaskView && descriptionImagePreviews.length > 0 && (
                <div className="relative z-10 clear-both flex flex-wrap gap-2 px-3 py-2.5 border-t border-slate-200/80 bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800/80">
                  {descriptionImagePreviews.map((img) => (
                    <div key={img.id} className="group relative shrink-0">
                      <img
                        src={img.url}
                        alt={img.name}
                        onClick={() =>
                          !img.id.startsWith("temp-") &&
                          viewAttachment(img.id, img.name, "image/*")
                        }
                        className={`h-16 w-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 ${
                          img.id.startsWith("temp-") ? "" : "cursor-pointer hover:opacity-90"
                        }`}
                        title={img.id.startsWith("temp-") ? undefined : "Click to expand"}
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeDescriptionImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 hidden h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-700 text-white group-hover:flex dark:bg-slate-600"
                          title="Remove image"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden dark:bg-slate-900 dark:border-slate-800" style={{ height: "min(60vh, 520px)" }}>
            <div className="flex-1 min-h-0 overflow-y-auto task-detail-thin-scroll p-4">
                {activityLoading ? (
                  <p className="text-sm text-slate-500 text-center py-8 dark:text-slate-400">
                    Loading activity…
                  </p>
                ) : activityFeed.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8 dark:text-slate-400">
                    No activity yet. Post an update or save changes to log them here.
                  </p>
                ) : (
                  <div className="space-y-0">
                    {activityFeed.map((item, index) => {
                      const isLast = index === activityFeed.length - 1;

                      if (item.source === "comment") {
                        const name = item.author?.username || "Unknown";
                        return (
                          <div key={item.id} className="flex gap-3 pb-4">
                            <div className="flex flex-col items-center pt-0.5">
                              <div
                                className={`w-8 h-8 rounded-full ${
                                  avatarBg(item.author?.avatarColor, item.author?._id || name)
                                    .className
                                } flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
                                style={
                                  avatarBg(item.author?.avatarColor, item.author?._id || name)
                                    .style
                                }
                              >
                                {avatarInitials(name)}
                              </div>
                              {!isLast && (
                                <div className="w-px flex-1 bg-slate-200 mt-2 min-h-[1rem] dark:bg-slate-700" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pb-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                                <span className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                                  {name}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20">
                                  <MessageSquare size={10} />
                                  Comment
                                </span>
                                <span className="text-[10px] text-slate-400 ml-auto shrink-0 dark:text-slate-500">
                                  {formatActivityTime(item.createdAt)}
                                  {item.editedAt && " · edited"}
                                </span>
                                {canEditComment(item) && editingCommentId !== item.id && (
                                  <button
                                    type="button"
                                    onClick={() => startEditComment(item)}
                                    aria-label="Edit comment"
                                    className="shrink-0 text-slate-400 hover:text-cyan-600 transition-colors dark:text-slate-500 dark:hover:text-cyan-400"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                )}
                              </div>
                              {editingCommentId === item.id ? (
                                <div className="mt-1">
                                  <textarea
                                    value={editingCommentBody}
                                    onChange={(e) => setEditingCommentBody(e.target.value)}
                                    rows={3}
                                    autoFocus
                                    className={`${textareaClass} text-sm`}
                                  />
                                  <div className="flex items-center gap-2 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => saveEditComment(item.id)}
                                      disabled={savingCommentEdit || !editingCommentBody.trim()}
                                      className="btn btn-primary btn-sm"
                                    >
                                      {savingCommentEdit ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditComment}
                                      disabled={savingCommentEdit}
                                      className="btn btn-ghost btn-sm"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                item.body && (
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words dark:text-slate-200">
                                    {renderCommentContent(
                                      item.body,
                                      item.mentions,
                                      members
                                    )}
                                  </p>
                                )
                              )}
                              {item.attachments && item.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {item.attachments.map((att) => {
                                    const full = attachments.find(
                                      (f) => f._id === att.attachmentId
                                    );
                                    return (
                                      <div
                                        key={att.attachmentId || att.originalName}
                                        className="flex items-center gap-1 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-1 dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-400/20"
                                      >
                                        <Paperclip size={12} />
                                        <span className="max-w-[140px] truncate">
                                          {att.originalName}
                                        </span>
                                        {att.attachmentId && (
                                          <>
                                            <button
                                              type="button"
                                              title="View"
                                              className="p-0.5 rounded hover:bg-cyan-100 dark:hover:bg-cyan-400/20"
                                              onClick={() =>
                                                viewAttachment(
                                                  att.attachmentId!,
                                                  att.originalName,
                                                  full?.mimeType
                                                )
                                              }
                                            >
                                              <Eye size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              title="Download"
                                              className="p-0.5 rounded hover:bg-cyan-100 dark:hover:bg-cyan-400/20"
                                              onClick={() =>
                                                downloadAttachment(
                                                  att.attachmentId!,
                                                  att.originalName
                                                )
                                              }
                                            >
                                              <Download size={12} />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const name = item.actor?.username || "System";
                      const style = getActivityEventStyle(item.action);
                      const Icon = getActivityEventIcon(item.action);

                      return (
                        <div key={item.id} className="flex gap-3 pb-4">
                          <div className="flex flex-col items-center pt-0.5">
                            <div
                              className={`w-8 h-8 rounded-full ${style.bg} flex items-center justify-center shrink-0`}
                            >
                              <Icon size={14} className={style.text} />
                            </div>
                            {!isLast && (
                              <div className="w-px flex-1 bg-slate-200 mt-2 min-h-[1rem] dark:bg-slate-700" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                              <p className="text-sm text-slate-700 flex-1 min-w-0 dark:text-slate-200">
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {name}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400"> </span>
                                <span>{item.message}</span>
                              </p>
                              <span className="text-[10px] text-slate-400 shrink-0 dark:text-slate-500">
                                {formatActivityTime(item.createdAt)}
                              </span>
                            </div>
                            {item.oldValue && item.newValue && (
                              <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                                {item.oldValue} → {item.newValue}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-slate-200 p-3 relative dark:border-slate-800">
                {mentionOpen && members.length > 0 && (
                  <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-36 overflow-y-auto z-10 dark:bg-slate-900 dark:border-slate-700">
                    {filteredMembers.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                        No members match
                      </p>
                    ) : (
                      filteredMembers.map((m, index) => (
                        <button
                          key={m.user._id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            insertMention(m.user.username);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 min-w-0 ${
                            index === mentionHighlight
                              ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          <span
                            className="min-w-0 flex-1 break-all"
                            title={`@${m.user.username}`}
                          >
                            @{m.user.username}
                          </span>
                          <span className="text-xs text-slate-500 shrink-0 dark:text-slate-400">
                            {m.role}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {pendingChatFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingChatFiles.map((f) => (
                      <span
                        key={f.id}
                        className="text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-1 flex items-center gap-1 dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-400/20"
                      >
                        <Paperclip size={11} />
                        {f.name}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingChatFiles((prev) =>
                              prev.filter((x) => x.id !== f.id)
                            )
                          }
                          className="text-slate-500 hover:text-red-500 ml-1 dark:text-slate-400 dark:hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-cyan-400 focus-within:bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-cyan-500 dark:focus-within:bg-slate-800">
                  <div
                    className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200/80 dark:border-slate-700/80"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <button
                      type="button"
                      onMouseDown={applyFormat("**", "**")}
                      className="btn btn-ghost btn-sm !h-7 !w-7 !px-0"
                      title="Bold"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={applyFormat("*", "*")}
                      className="btn btn-ghost btn-sm !h-7 !w-7 !px-0"
                      title="Italic"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={applyFormat("__", "__")}
                      className="btn btn-ghost btn-sm !h-7 !w-7 !px-0"
                      title="Underline"
                    >
                      <Underline size={14} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={applyFormat("~~", "~~")}
                      className="btn btn-ghost btn-sm !h-7 !w-7 !px-0"
                      title="Strikethrough"
                    >
                      <Strikethrough size={14} />
                    </button>
                    <span className="w-px h-4 bg-slate-200 mx-1 dark:bg-slate-700" />
                    <button
                      type="button"
                      onClick={() => chatFileRef.current?.click()}
                      disabled={chatUploading}
                      className="btn btn-ghost btn-sm !h-7 !w-7 !px-0 hover:text-cyan-700 disabled:opacity-40 dark:hover:text-cyan-400"
                      title="Attach file"
                    >
                      <Paperclip size={14} />
                    </button>
                    <input
                      ref={chatFileRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadChatAttachment(file);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div className="flex items-end gap-2 p-2">
                    <textarea
                      ref={chatRef}
                      value={chatInput}
                      onChange={(e) => {
                        handleChatChange(e.target.value, e.target.selectionStart);
                        syncChatSelection(e.target);
                      }}
                      onSelect={(e) => syncChatSelection(e.currentTarget)}
                      onKeyUp={(e) => syncChatSelection(e.currentTarget)}
                      onClick={(e) => syncChatSelection(e.currentTarget)}
                      onKeyDown={handleChatKeyDown}
                      onPaste={handleChatPaste}
                      rows={2}
                      placeholder="Write an update... use @ to mention"
                      className="flex-1 bg-transparent text-slate-900 text-sm resize-none placeholder:text-slate-400 px-1.5 py-1 focus:outline-none focus-visible:shadow-none dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={sendComment}
                      disabled={
                        (!chatInput.trim() && pendingChatFiles.length === 0) ||
                        sendingComment
                      }
                      className="btn btn-primary btn-sm !px-3 shrink-0"
                      title="Send"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
        </div>

        {/* Footer toolbar — delete on the left, close/save on the right */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 rounded-b-2xl px-6 py-4 dark:border-slate-800 dark:bg-slate-800">
          {message && (
            <p
              className={`text-sm mb-2.5 ${
                message === "Saved" || message === "Link copied"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {message}
            </p>
          )}
          <div className="flex gap-3 justify-between">
            {canEdit ? (
              isSubtaskView && activeSubtask ? (
                <button
                  type="button"
                  onClick={() => deleteSubtask(activeSubtask._id)}
                  disabled={subtaskSaving}
                  className="btn btn-danger"
                >
                  Delete subtask
                </button>
              ) : (
                <button
                  onClick={deleteTask}
                  disabled={deleting}
                  className="btn btn-danger"
                >
                  {deleting ? "Moving..." : "Move to trash"}
                </button>
              )
            ) : onRestore ? (
              <button
                type="button"
                onClick={onRestore}
                disabled={restoring}
                className="btn btn-primary"
              >
                <RotateCcw size={14} />
                {restoring ? "Restoring..." : "Restore"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {!isSubtaskView && canEdit && taskSaveMsg && (
                <span
                  className={`text-xs ${
                    taskSaveMsg === "Couldn't save"
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {taskSaveMsg}
                </span>
              )}
              {!isSubtaskView && task.createdBy?.username && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Created by {task.createdBy.username}
                </span>
              )}
              <button onClick={handleClose} className="btn btn-secondary">
                Close
              </button>
              {!isSubtaskView && canEdit && (
                <button
                  onClick={handleSaveTask}
                  disabled={taskSaving || !title.trim() || !hasUnsavedChanges}
                  className="btn btn-primary"
                >
                  {taskSaving ? "Saving..." : "Save changes"}
                </button>
              )}
              {/* Subtasks keep their own explicit Save (unchanged). */}
              {isSubtaskView && canEdit && (
                <button
                  onClick={handleSave}
                  disabled={subtaskSaving || !subtaskTitle.trim() || !hasUnsavedChanges}
                  className="btn btn-primary"
                >
                  {subtaskSaving ? "Saving..." : "Save changes"}
                </button>
              )}
            </div>
          </div>
        </div>

      <WorkingDaysDialog
        open={workingDaysDialogOpen}
        value={isSubtaskView ? subtaskWorkingDaysConfig : workingDaysConfig}
        canEdit={canEdit}
        onClose={() => setWorkingDaysDialogOpen(false)}
        onApply={handleWorkingDaysApply}
      />

      {attachmentPreview && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={closeAttachmentPreview}
          role="presentation"
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={attachmentPreview.name}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {attachmentPreview.name}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={attachmentPreview.url}
                  download={attachmentPreview.name}
                  className="btn btn-ghost btn-sm !h-8 gap-1.5 text-cyan-700 dark:text-cyan-400"
                >
                  <Download size={14} />
                  Download
                </a>
                <button
                  type="button"
                  onClick={closeAttachmentPreview}
                  className="btn btn-ghost btn-sm !h-8 !w-8 !px-0"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-50 p-3 dark:bg-slate-950">
              {attachmentPreview.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentPreview.url}
                  alt={attachmentPreview.name}
                  className="max-h-[75vh] max-w-full object-contain"
                />
              ) : (
                <iframe
                  title={attachmentPreview.name}
                  src={attachmentPreview.url}
                  className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}