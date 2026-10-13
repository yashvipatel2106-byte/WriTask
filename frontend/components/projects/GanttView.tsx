"use client";

import { authFetch } from "@/lib/validation/authFetch";
import { buildStatusOptions } from "@/lib/taskStatuses";
import type { CustomStatus } from "@/lib/taskStatuses";
import type { CardPreviewConfig, ProjectCustomField } from "@/lib/kanbanCardPreview";
import type { TaskItem } from "./KanbanBoard";
import TaskDetailDialog from "./TaskDetailDialog";
import { AssigneeAvatars } from "./KanbanTaskCardFields";
import {
  buildTrunkBranchDependencyPaths,
  calendarDaysBetween,
  dependencyAnchors,
  dependencyPredecessorId,
  DEPENDENCY_TYPE_META,
  findFsConflicts,
  formatPredecessorCell,
  orthogonalDependencyPath,
  parsePredecessorInput,
  resizeDateRange,
  resolvePredecessorTokens,
  serializeDependenciesForSave,
  shiftDateRange,
  toDateKey,
  wouldCreateCycle,
  type DependencyType,
  type TaskDependency,
} from "@/lib/taskDependencies";
import {
  analyzeCriticalPath,
  formatSlackLabel,
} from "@/lib/criticalPath";
import {
  findOverdueMilestones,
  milestoneStatusLabel,
  type MilestoneItem,
  type MilestoneStatus,
} from "@/lib/milestones";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
  differenceInCalendarDays,
} from "date-fns";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  GitBranch,
  Plus,
  Trash2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import {
  baselineItemForTask,
  calculateTaskVariance,
  formatVariance,
  summarizeBaselineSchedule,
  type ScheduleBaseline,
} from "@/lib/scheduleBaselines";
import Select from "@/components/ui/Select";
import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import { hasPermission } from "@/lib/rbac/permissions";

type Props = {
  projectId: string;
  tasks: TaskItem[];
  canEdit: boolean;
  projectPermissions?: string[];
  customStatuses?: CustomStatus[];
  customFields?: ProjectCustomField[];
  otherCustomFields?: ProjectCustomField[];
  cardPreviewConfig?: CardPreviewConfig | null;
  adoptedCustomFieldIds?: string[];
  organizationId?: string | null;
  onTasksChange: (tasks: TaskItem[]) => void;
  milestones?: MilestoneItem[];
  onMilestonesChange?: (milestones: MilestoneItem[]) => void;
  initialTaskId?: string | null;
  initialSubtaskId?: string | null;
  onTaskUrlChange?: (taskId: string | null, subtaskId?: string | null) => void;
  baselines?: ScheduleBaseline[];
  onBaselinesChange?: (baselines: ScheduleBaseline[]) => void;
};

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  taskId: string;
  mode: DragMode;
  originX: number;
  startKey: string;
  dueKey: string;
  previewStart: string;
  previewDue: string;
  lastX: number;
};

type PendingSchedule = {
  taskId: string;
  startDate: string;
  dueDate: string;
  originalStart: string;
  originalDue: string;
};

const LIVE_ROW_H = 44;
const BASELINE_ROW_H = 22;
const ROW_H = LIVE_ROW_H + BASELINE_ROW_H;
const TABLE_W = 580;
const DAY_MIN = 28;
const DAY_MAX = 56;

function parseKey(key: string) {
  return parseISO(`${key}T12:00:00`);
}

/** The Today window starts 7 days before today, so this date tracks the arrows. */
function formatGanttNavLabel(rangeStart: Date, today: Date) {
  const focus = startOfDay(addDays(startOfDay(rangeStart), 7));
  const diff = differenceInCalendarDays(focus, startOfDay(today));
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const sameYear = focus.getFullYear() === startOfDay(today).getFullYear();
  return format(focus, sameYear ? "d MMM" : "d MMM yyyy");
}

function barColor(status?: string, priority?: string) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "done") return "#94A3B8";
  if (s.includes("progress")) return "#3B82F6";
  if (s.includes("review")) return "#8B5CF6";
  const p = (priority || "").toLowerCase();
  if (p === "high") return "#F43F5E";
  if (p === "low") return "#14B8A6";
  return "#06B6D4";
}

function normalizeDeps(task: TaskItem): TaskDependency[] {
  return Array.isArray(task.dependencies) ? task.dependencies : [];
}

type ConflictCategory =
  | "dependency"
  | "assignee"
  | "deadline"
  | "baseline"
  | "circular";

type GanttScheduleConflict = {
  id: string;
  category: ConflictCategory;
  badge: string;
  message: string;
  taskId?: string;
};

function getTaskAssigneeIds(task: TaskItem): string[] {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.map((assignee) => String(assignee._id));
  }

  return task.assignee?._id ? [String(task.assignee._id)] : [];
}

function getTaskAssigneeNames(task: TaskItem): string[] {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees
      .map((assignee) => assignee.username)
      .filter(Boolean);
  }

  return task.assignee?.username ? [task.assignee.username] : [];
}

function findAssigneeConflicts(tasks: TaskItem[]): GanttScheduleConflict[] {
  const conflicts: GanttScheduleConflict[] = [];

  for (let i = 0; i < tasks.length; i += 1) {
    const first = tasks[i];
    const firstStart = toDateKey(first.startDate);
    const firstDue = toDateKey(first.dueDate);

    if (!firstStart || !firstDue) continue;

    const firstAssignees = getTaskAssigneeIds(first);

    if (firstAssignees.length === 0) continue;

    for (let j = i + 1; j < tasks.length; j += 1) {
      const second = tasks[j];
      const secondStart = toDateKey(second.startDate);
      const secondDue = toDateKey(second.dueDate);

      if (!secondStart || !secondDue) continue;

      const secondAssignees = getTaskAssigneeIds(second);

      if (secondAssignees.length === 0) continue;

      const sharedAssigneeIds = firstAssignees.filter((id) =>
        secondAssignees.includes(id)
      );

      if (sharedAssigneeIds.length === 0) continue;

      const overlaps =
        firstStart <= secondDue &&
        secondStart <= firstDue;

      if (!overlaps) continue;

      const names = getTaskAssigneeNames(first);
      const secondNames = getTaskAssigneeNames(second);

      const sharedNames = [
        ...new Set(
          [...names, ...secondNames].filter((name) => {
            const firstHas = names.includes(name);
            const secondHas = secondNames.includes(name);
            return firstHas && secondHas;
          })
        ),
      ];

      const assigneeLabel =
        sharedNames.length > 0
          ? sharedNames.join(", ")
          : "the same assignee";

      conflicts.push({
        id: `assignee-${first._id}-${second._id}`,
        category: "assignee",
        badge: "ASSIGNEE",
        taskId: first._id,
        message: `"${first.title}" overlaps with "${second.title}" for ${assigneeLabel}.`,
      });
    }
  }

  return conflicts;
}

function findDeadlineConflicts(
  tasks: TaskItem[],
  today: Date
): GanttScheduleConflict[] {
  const todayKey = toDateKey(today);

  if (!todayKey) return [];

  return tasks
    .filter((task) => {
      const due = toDateKey(task.dueDate);
      if (!due) return false;

      const status = String(task.status || "").toLowerCase();

      const completed =
        status === "completed" ||
        status === "done" ||
        status.includes("completed") ||
        status.includes("done");

      return !completed && due < todayKey;
    })
    .map((task) => ({
      id: `deadline-${task._id}`,
      category: "deadline" as const,
      badge: "DEADLINE",
      taskId: task._id,
      message: `"${task.title}" is overdue. Its deadline was ${toDateKey(
        task.dueDate
      )}.`,
    }));
}

function findCircularDependencyConflicts(
  tasks: TaskItem[]
): GanttScheduleConflict[] {
  const graph = new Map<string, string[]>();
  const titleById = new Map<string, string>();

  for (const task of tasks) {
    const taskId = String(task._id);

    titleById.set(taskId, task.title);

    const predecessors = normalizeDeps(task)
      .map((dependency) => dependencyPredecessorId(dependency))
      .filter(Boolean) as string[];

    for (const predecessorId of predecessors) {
      const successors = graph.get(predecessorId) ?? [];
      successors.push(taskId);
      graph.set(predecessorId, successors);
    }

    if (!graph.has(taskId)) {
      graph.set(taskId, []);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const conflicts: GanttScheduleConflict[] = [];
  const reportedCycles = new Set<string>();

  const visit = (taskId: string, path: string[]): void => {
    if (visiting.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      const cycle =
        cycleStart >= 0 ? path.slice(cycleStart).concat(taskId) : [taskId];

      const cycleKey = [...new Set(cycle)].sort().join("|");

      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey);

        const cycleTitles = cycle.map(
          (id) => titleById.get(id) || "Unknown task"
        );

        conflicts.push({
          id: `circular-${cycleKey}`,
          category: "circular",
          badge: "CIRCULAR",
          taskId,
          message: `Circular dependency detected: ${cycleTitles.join(
            " → "
          )}.`,
        });
      }

      return;
    }

    if (visited.has(taskId)) return;

    visiting.add(taskId);

    const nextPath = [...path, taskId];

    for (const successorId of graph.get(taskId) ?? []) {
      visit(successorId, nextPath);
    }

    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const taskId of graph.keys()) {
    visit(taskId, []);
  }

  return conflicts;
}
export default function GanttView({
  projectId,
  tasks,
  canEdit,
  projectPermissions = [],
  customStatuses = [],
  customFields = [],
  otherCustomFields = [],
  cardPreviewConfig = null,
  adoptedCustomFieldIds = [],
  organizationId = null,
  onTasksChange,
  milestones = [],
  onMilestonesChange,
  initialTaskId = null,
  initialSubtaskId = null,
  onTaskUrlChange,
  baselines = [],
onBaselinesChange,


}: Props) {
    
    const canViewGantt = hasPermission(
    projectPermissions,
    "gantt:read"
  );

  const canEditSchedule = hasPermission(
    projectPermissions,
    "gantt:editSchedule"
  );

  const canManageDependencies = hasPermission(
    projectPermissions,
    "gantt:manageDependencies"
  );

  const canManageMilestones = hasPermission(
    projectPermissions,
    "gantt:manageMilestones"
  );

  const canViewCriticalPath = hasPermission(
    projectPermissions,
    "gantt:viewCriticalPath"
  );

  const canViewConflicts = hasPermission(
    projectPermissions,
    "gantt:viewConflicts"
  );

  const canResolveConflicts = hasPermission(
    projectPermissions,
    "gantt:resolveConflicts"
  );

  const canViewBaseline = hasPermission(
    projectPermissions,
    "gantt:viewBaseline"
  );

  const canManageBaseline = hasPermission(
    projectPermissions,
    "gantt:manageBaseline"
  );
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [dayWidth, setDayWidth] = useState(40);
  const [rangeStart, setRangeStart] = useState(() =>
    startOfDay(addDays(new Date(), -7))
  );
  const [rangeDays, setRangeDays] = useState(42);
  const [resourceWarnings, setResourceWarnings] = useState<string[]>([]);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
const [conflictFilter, setConflictFilter] =
  useState<ConflictCategory | "all">("all");
  const [linkType, setLinkType] = useState<DependencyType>("FS");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [milestoneDialog, setMilestoneDialog] = useState<{
    mode: "create" | "edit";
    milestone: MilestoneItem | null;
  } | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const [milestoneStatus, setMilestoneStatus] =
    useState<MilestoneStatus>("pending");
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [depsPanelTaskId, setDepsPanelTaskId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(
    null
  );
 const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
const [showBaseline, setShowBaseline] = useState(false);
const [baselineDialogOpen, setBaselineDialogOpen] = useState(false);
const [baselineName, setBaselineName] = useState("");
const [baselineSaving, setBaselineSaving] = useState(false);
const [showBaselineHelper, setShowBaselineHelper] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingPredTaskId, setEditingPredTaskId] = useState<string | null>(null);
  const [predDraft, setPredDraft] = useState("");
  const [predError, setPredError] = useState<string | null>(null);
  const [linkDrag, setLinkDrag] = useState<{
    predecessorId: string;
    type: DependencyType;
    x: number;
    y: number;
  } | null>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);
  const syncingXRef = useRef(false);
  const syncingYRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const linkDragRef = useRef<{
    predecessorId: string;
    type: DependencyType;
  } | null>(null);
  const suppressBarClickRef = useRef(false);
  const didOpenInitial = useRef(false);
 


  const syncHorizontalScroll = (
    source: "header" | "chart",
    scrollLeft: number
  ) => {
    if (syncingXRef.current) return;
    syncingXRef.current = true;
    if (source === "chart" && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
    if (source === "header" && chartScrollRef.current) {
      chartScrollRef.current.scrollLeft = scrollLeft;
    }
    requestAnimationFrame(() => {
      syncingXRef.current = false;
    });
  };

  const syncVerticalScroll = (
    source: "labels" | "chart",
    scrollTop: number
  ) => {
    if (syncingYRef.current) return;
    syncingYRef.current = true;
    if (source === "chart" && labelScrollRef.current) {
      labelScrollRef.current.scrollTop = scrollTop;
    }
    if (source === "labels" && chartScrollRef.current) {
      chartScrollRef.current.scrollTop = scrollTop;
    }
    requestAnimationFrame(() => {
      syncingYRef.current = false;
    });
  };

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const as = toDateKey(a.startDate);
      const bs = toDateKey(b.startDate);
      if (as && bs) return as.localeCompare(bs);
      if (as) return -1;
      if (bs) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [tasks]);

  const rangeEnd = useMemo(
    () => addDays(rangeStart, rangeDays - 1),
    [rangeStart, rangeDays]
  );

  useEffect(() => {
    if (!organizationId) {
      setResourceWarnings([]);
      return;
    }
    const params = new URLSearchParams({
      organizationId,
      projectId,
      startDate: rangeStart.toISOString(),
      endDate: rangeEnd.toISOString(),
    });
    let cancelled = false;
    authFetch(`/dashboard/team-workload?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const warnings = (data.members || [])
          .filter(
            (member: { overallocated?: boolean; remainingCapacity?: number }) =>
              member.overallocated || (member.remainingCapacity ?? 0) < 0
          )
          .map(
            (member: {
              username: string;
              overBy?: number;
              remainingCapacity?: number;
            }) => {
              const over = Math.abs(
                Number(member.overBy || member.remainingCapacity || 0)
              );
              return `${member.username} is overallocated by ${over}h during this period.`;
            }
          );
        setResourceWarnings(warnings);
      })
      .catch(() => {
        if (!cancelled) setResourceWarnings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId, rangeStart, rangeEnd, tasks]);

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const today = startOfDay(new Date());

  // Fit visible window around scheduled tasks when data first loads.
  useEffect(() => {
    const keys = tasks
      .flatMap((t) => [toDateKey(t.startDate), toDateKey(t.dueDate)])
      .filter(Boolean) as string[];
    if (keys.length === 0) return;
    const min = keys.reduce((a, b) => (a < b ? a : b));
    const max = keys.reduce((a, b) => (a > b ? a : b));
    const start = addDays(parseKey(min), -3);
    const span = calendarDaysBetween(min, max) + 10;
    setRangeStart(startOfDay(start));
    setRangeDays(Math.max(21, Math.min(120, span)));
  }, [tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (didOpenInitial.current || !initialTaskId) return;
    const task = tasks.find((t) => t._id === initialTaskId);
    if (task) {
      didOpenInitial.current = true;
      setSelectedTask(task);
    }
  }, [initialTaskId, tasks]);

  const conflicts = useMemo(() => findFsConflicts(sortedTasks), [sortedTasks]);
  const criticalPath = useMemo(
    () => analyzeCriticalPath(sortedTasks),
    [sortedTasks]
  );
  const overdueMilestones = useMemo(
    () => findOverdueMilestones(milestones, today),
    [milestones, today]
  );

  const taskIndex = useMemo(() => {
    const map = new Map<string, number>();
    sortedTasks.forEach((t, i) => map.set(t._id, i));
    return map;
  }, [sortedTasks]);

  const rowByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    sortedTasks.forEach((t, i) => map.set(t._id, i + 1));
    return map;
  }, [sortedTasks]);

  const previewDates = useCallback(
    (task: TaskItem) => {
      if (pendingSchedule && pendingSchedule.taskId === task._id) {
        return {
          start: pendingSchedule.startDate,
          due: pendingSchedule.dueDate,
        };
      }
      if (drag && drag.taskId === task._id) {
        return { start: drag.previewStart, due: drag.previewDue };
      }
      return {
        start: toDateKey(task.startDate),
        due: toDateKey(task.dueDate),
      };
    },
    [drag, pendingSchedule]
  );

  const dayIndexForKey = useCallback(
    (key: string) => {
      const d = startOfDay(parseKey(key));
      return Math.round(
        (d.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
      );
    },
    [rangeStart]
  );

  const persistSchedule = async (
    task: TaskItem,
    startDate: string,
    dueDate: string
  ) => {
    if (!canEditSchedule) {
      toast.error("You do not have permission to edit the Gantt schedule");
      setPendingSchedule(null);
      return;
    }

    setSavingId(task._id);
    try {
      const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, dueDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not update schedule");
      }
      const updated = (await res.json()) as TaskItem;
      onTasksChange(tasks.map((t) => (t._id === updated._id ? updated : t)));
      if (selectedTask?._id === updated._id) setSelectedTask(updated);
      toast.success("Schedule updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
      setPendingSchedule(null);
    }
  };

  const formatScheduleLabel = (start: string, due: string) => {
    try {
      return `${format(parseKey(start), "MMM d, yyyy")} → ${format(parseKey(due), "MMM d, yyyy")}`;
    } catch {
      return `${start} → ${due}`;
    }
  };

  const confirmAndPersistSchedule = async (
    task: TaskItem,
    startDate: string,
    dueDate: string,
    originalStart: string,
    originalDue: string
  ) => {
    if (!canEditSchedule) {
      toast.error("You do not have permission to edit the Gantt schedule");
      return;
    }

    setPendingSchedule({
      taskId: task._id,
      startDate,
      dueDate,
      originalStart,
      originalDue,
    });

    const ok = await confirmDialog({
      title: "Change task dates?",
      description: `Update “${task.title}” from ${formatScheduleLabel(originalStart, originalDue)} to ${formatScheduleLabel(startDate, dueDate)}?`,
      confirmLabel: "Yes, update",
      cancelLabel: "No, keep original",
    });

    if (!ok) {
      setPendingSchedule(null);
      return;
    }

    await persistSchedule(task, startDate, dueDate);
  };

 const persistDependencies = async (
  task: TaskItem,
  dependencies: TaskDependency[],
  successMessage = "Dependency updated"
) => {
  if (!canManageDependencies) {
    toast.error("You do not have permission to manage dependencies");
    return;
  }
    const previousTasks = tasks;
    const optimistic: TaskItem = { ...task, dependencies };
    onTasksChange(
      tasks.map((t) => (t._id === task._id ? optimistic : t))
    );
    if (selectedTask?._id === task._id) setSelectedTask(optimistic);
    setSavingId(task._id);
    try {
      const res = await authFetch(`/projects/${projectId}/tasks/${task._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dependencies: serializeDependenciesForSave(dependencies),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not update dependencies");
      }
      const updated = (await res.json()) as TaskItem;
      onTasksChange(
        previousTasks.map((t) => (t._id === updated._id ? updated : t))
      );
      if (selectedTask?._id === updated._id) setSelectedTask(updated);
      toast.success(successMessage);
      if (
        depsPanelTaskId === task._id &&
        (!updated.dependencies || updated.dependencies.length === 0)
      ) {
        setDepsPanelTaskId(null);
      }
    } catch (e) {
      onTasksChange(previousTasks);
      if (selectedTask?._id === task._id) {
        const rolled = previousTasks.find((t) => t._id === task._id) || null;
        setSelectedTask(rolled);
      }
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
      setLinkFromId(null);
    }
  };

  const addDependency = (
    successor: TaskItem,
    predecessorId: string,
    type: DependencyType = "FS",
    successMessage = "Dependency linked"
  ) => {
    if (successor._id === predecessorId) {
      toast.error("A task cannot depend on itself");
      setLinkFromId(null);
      return;
    }
    const existing = normalizeDeps(successor);
    const already = existing.find(
      (d) => dependencyPredecessorId(d) === predecessorId
    );
    if (already) {
      const currentType = String(already.type || "FS").toUpperCase();
      if (currentType === type) {
        toast.error("Dependency already exists");
        setLinkFromId(null);
        return;
      }
      const next = existing.map((d) =>
        dependencyPredecessorId(d) === predecessorId ? { ...d, type } : d
      );
      void persistDependencies(
        successor,
        next,
        `${type} dependency updated`
      );
      return;
    }
    const next = [
      ...existing,
      { taskId: predecessorId, type, lagDays: 0 },
    ];
    if (
      wouldCreateCycle(
        successor._id,
        next.map((d) => dependencyPredecessorId(d)).filter(Boolean) as string[],
        tasks
      )
    ) {
      toast.error("This dependency would create a circular relationship");
      setLinkFromId(null);
      return;
    }
    void persistDependencies(successor, next, successMessage);
  };

  const beginPredecessorEdit = (task: TaskItem) => {
  if (!canManageDependencies || savingId) return;
    setEditingPredTaskId(task._id);
    setPredDraft(formatPredecessorCell(normalizeDeps(task), rowByTaskId));
    setPredError(null);
  };

  const cancelPredecessorEdit = () => {
    setEditingPredTaskId(null);
    setPredDraft("");
    setPredError(null);
  };

  const commitPredecessorEdit = async (task: TaskItem) => {
    const parsed = parsePredecessorInput(predDraft);
    if (!parsed.ok) {
      setPredError(parsed.error);
      toast.error(parsed.error);
      return;
    }

    const resolved = resolvePredecessorTokens({
      tokens: parsed.tokens,
      successorId: task._id,
      tasksInOrder: sortedTasks,
    });
    if (!resolved.ok) {
      setPredError(resolved.error);
      toast.error(resolved.error);
      return;
    }

    const current = serializeDependenciesForSave(normalizeDeps(task));
    const next = resolved.dependencies;
    const same =
      current.length === next.length &&
      current.every(
        (c, i) =>
          c.taskId === next[i].taskId &&
          c.type === next[i].type &&
          c.lagDays === next[i].lagDays
      );
    cancelPredecessorEdit();
    if (same) return;
    await persistDependencies(task, next, "Predecessors updated");
  };

  const onBarPointerDown = (
    e: React.PointerEvent,
    task: TaskItem,
    mode: DragMode
  ) => {
    if (!canEditSchedule || savingId) return;
    const start = toDateKey(task.startDate);
    const due = toDateKey(task.dueDate);
    if (!start || !due) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({
      taskId: task._id,
      mode,
      originX: e.clientX,
      startKey: start,
      dueKey: due,
      previewStart: start,
      previewDue: due,
      lastX: e.clientX,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const deltaDays = Math.round((e.clientX - current.originX) / dayWidth);
      let next;
      if (current.mode === "move") {
        next = shiftDateRange(current.startKey, current.dueKey, deltaDays);
      } else if (current.mode === "resize-start") {
        next = resizeDateRange(
          current.startKey,
          current.dueKey,
          "start",
          deltaDays
        );
      } else {
        next = resizeDateRange(
          current.startKey,
          current.dueKey,
          "end",
          deltaDays
        );
      }
      const updated = {
        ...current,
        previewStart: next.startDate,
        previewDue: next.dueDate,
        lastX: e.clientX,
      };
      dragRef.current = updated;
      setDrag(updated);
    };

    const onUp = () => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;

      const movedPx = Math.abs(current.lastX - current.originX);
      const changed =
        current.previewStart !== current.startKey ||
        current.previewDue !== current.dueKey;

      // Drag or meaningful pointer movement should never open the task dialog.
      if (changed || movedPx > 4) {
        suppressBarClickRef.current = true;
      }

      if (!changed) return;

      const task = tasks.find((t) => t._id === current.taskId);
      if (!task) return;

      void confirmAndPersistSchedule(
        task,
        current.previewStart,
        current.previewDue,
        current.startKey,
        current.dueKey
      );
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, dayWidth, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRowClick = (task: TaskItem) => {
    if (linkFromId && canManageDependencies) {
      if (linkFromId === task._id) {
        setLinkFromId(null);
        return;
      }
      const successor = tasks.find((t) => t._id === linkFromId);
      if (!successor) {
        setLinkFromId(null);
        return;
      }
      addDependency(successor, task._id, linkType);
      return;
    }
    setSelectedTask(task);
    onTaskUrlChange?.(task._id, null);
  };

  const predecessorTitle = useCallback(
    (dep: TaskDependency) => {
      const predId = dependencyPredecessorId(dep);
      if (!predId) return "Unknown task";
      if (typeof dep.taskId === "object" && dep.taskId?.title) {
        return dep.taskId.title;
      }
      return tasks.find((t) => t._id === predId)?.title || "Unknown task";
    },
    [tasks]
  );

  const removeDependency = async (
    task: TaskItem,
    predecessorId: string,
    opts?: { confirm?: boolean; predecessorTitle?: string }
  ) => {
    if (opts?.confirm !== false) {
      const ok = await confirmDialog({
        title: "Remove dependency?",
        description: opts?.predecessorTitle
          ? `"${task.title}" will no longer depend on "${opts.predecessorTitle}".`
          : `Remove this dependency from "${task.title}"?`,
        confirmLabel: "Remove",
        variant: "danger",
      });
      if (!ok) return;
    }
    const next = normalizeDeps(task).filter(
      (d) => dependencyPredecessorId(d) !== predecessorId
    );
    void persistDependencies(task, next, "Dependency removed");
  };

  const clearAllDependencies = async (task: TaskItem) => {
    const count = normalizeDeps(task).length;
    if (count === 0) return;
    const ok = await confirmDialog({
      title: "Remove all dependencies?",
      description: `This clears ${count} link${count === 1 ? "" : "s"} from "${task.title}".`,
      confirmLabel: "Remove all",
      variant: "danger",
    });
    if (!ok) return;
    void persistDependencies(task, [], "All dependencies removed");
  };

 const canAccessBaseline = canViewBaseline || canManageBaseline;

  const selectedBaseline = useMemo(
    () =>
      canAccessBaseline
        ? baselines.find((item) => item._id === selectedBaselineId) ?? null
        : null,
    [baselines, selectedBaselineId, canAccessBaseline]
  );

const allScheduleConflicts = useMemo<GanttScheduleConflict[]>(() => {
  const dependencyConflicts: GanttScheduleConflict[] = conflicts.map((c) => ({
    id: `dependency-${c.taskId}-${c.predecessorId}-${c.type}`,
    category: "dependency",
    badge: c.type,
    taskId: c.taskId,
    message: c.message,
  }));

  const assigneeConflicts = findAssigneeConflicts(sortedTasks);

  const deadlineConflicts = findDeadlineConflicts(sortedTasks, today);

  const baselineConflicts: GanttScheduleConflict[] = [];

  if (selectedBaseline) {
    for (const task of sortedTasks) {
      const baselineItem = baselineItemForTask(
        selectedBaseline,
        task._id
      );

      const variance = calculateTaskVariance(task, baselineItem);

      if (!variance) continue;

      if (
        variance.startVarianceDays !== 0 ||
        variance.finishVarianceDays !== 0
      ) {
        const startVariance =
          variance.startVarianceDays === 0
            ? "start is on plan"
            : variance.startVarianceDays > 0
              ? `starts ${variance.startVarianceDays} day${
                  variance.startVarianceDays === 1 ? "" : "s"
                } late`
              : `starts ${Math.abs(variance.startVarianceDays)} day${
                  Math.abs(variance.startVarianceDays) === 1 ? "" : "s"
                } early`;

        const finishVariance =
          variance.finishVarianceDays === 0
            ? "finish is on plan"
            : variance.finishVarianceDays > 0
              ? `finishes ${variance.finishVarianceDays} day${
                  variance.finishVarianceDays === 1 ? "" : "s"
                } late`
              : `finishes ${Math.abs(variance.finishVarianceDays)} day${
                  Math.abs(variance.finishVarianceDays) === 1 ? "" : "s"
                } early`;

        baselineConflicts.push({
          id: `baseline-${selectedBaseline._id}-${task._id}`,
          category: "baseline",
          badge: "BASELINE",
          taskId: task._id,
          message: `"${task.title}" differs from the selected baseline: ${startVariance}; ${finishVariance}.`,
        });
      }
    }
  }

  const circularConflicts = findCircularDependencyConflicts(sortedTasks);

  return [
    ...dependencyConflicts,
    ...assigneeConflicts,
    ...deadlineConflicts,
    ...baselineConflicts,
    ...circularConflicts,
  ];
}, [
  conflicts,
  sortedTasks,
  selectedBaseline,
  today,
]);

const conflictIds = useMemo(
  () =>
    new Set(
      allScheduleConflicts
        .map((conflict) => conflict.taskId)
        .filter(Boolean) as string[]
    ),
  [allScheduleConflicts]
);

const filteredScheduleConflicts = useMemo(() => {
  if (conflictFilter === "all") {
    return allScheduleConflicts;
  }

  return allScheduleConflicts.filter(
    (conflict) => conflict.category === conflictFilter
  );
}, [allScheduleConflicts, conflictFilter]);

const conflictCounts = useMemo(() => {
  return {
    all: allScheduleConflicts.length,
    dependency: allScheduleConflicts.filter(
      (conflict) => conflict.category === "dependency"
    ).length,
    assignee: allScheduleConflicts.filter(
      (conflict) => conflict.category === "assignee"
    ).length,
    deadline: allScheduleConflicts.filter(
      (conflict) => conflict.category === "deadline"
    ).length,
    baseline: allScheduleConflicts.filter(
      (conflict) => conflict.category === "baseline"
    ).length,
    circular: allScheduleConflicts.filter(
      (conflict) => conflict.category === "circular"
    ).length,
  };
}, [allScheduleConflicts]);


  const linkPaths = useMemo(() => {
    const edges: Array<{
      key: string;
      predecessorId: string;
      successorId: string;
      type: DependencyType;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      conflict: boolean;
      predecessorTitle: string;
      entry: "left" | "right";
      exitLeft?: boolean;
      clearOfLeftXs: number[];
      clearOfRightXs: number[];
    }> = [];

    const barEdgesForRow = (
      row: number
    ): { left: number; right: number } | null => {
      const t = sortedTasks[row];
      if (!t) return null;
      const { start, due } = previewDates(t);
      if (!start || !due) return null;
      const startIdx = dayIndexForKey(start);
      const endIdx = dayIndexForKey(due);
      if (endIdx < 0 || startIdx >= days.length) return null;
      const left = Math.max(0, startIdx) * dayWidth + 2;
      const right =
        Math.min(days.length - 1, endIdx) * dayWidth + dayWidth - 2;
      return { left, right };
    };

    for (const task of sortedTasks) {
      const si = taskIndex.get(task._id);
      if (si == null) continue;
      const succDates = previewDates(task);
      if (!succDates.start || !succDates.due) continue;
      const succStartDay = dayIndexForKey(succDates.start);
      const succDueDay = dayIndexForKey(succDates.due);
      if (succDueDay < 0 || succStartDay >= days.length) continue;

      const succStartX = Math.max(0, succStartDay) * dayWidth + 2;
      const succFinishX =
        Math.min(days.length - 1, succDueDay) * dayWidth + dayWidth - 2;
      const y2 = si * ROW_H + LIVE_ROW_H / 2;

      for (const dep of normalizeDeps(task)) {
        const rawType = String(dep.type || "FS").toUpperCase();
        const type: DependencyType =
          rawType === "SS" || rawType === "FF" || rawType === "SF"
            ? rawType
            : "FS";
        const anchors = dependencyAnchors(type);
        const predId = dependencyPredecessorId(dep);
        if (!predId) continue;
        const pred = sortedTasks.find((t) => t._id === predId);
        const pi = taskIndex.get(predId);
        if (!pred || pi == null) continue;
        const predDates = previewDates(pred);
        if (!predDates.start || !predDates.due) continue;
        const predStartDay = dayIndexForKey(predDates.start);
        const predDueDay = dayIndexForKey(predDates.due);
        if (predDueDay < 0 || predStartDay >= days.length) continue;

        const predStartX = Math.max(0, predStartDay) * dayWidth + 2;
        const predFinishX =
          Math.min(days.length - 1, predDueDay) * dayWidth + dayWidth - 2;

        const x1 = anchors.from === "start" ? predStartX : predFinishX;
        const x2 = anchors.to === "start" ? succStartX : succFinishX;
        const y1 = pi * ROW_H + LIVE_ROW_H / 2;

        const clearOfLeftXs: number[] = [succStartX];
        const clearOfRightXs: number[] = [succFinishX, predFinishX];
        const rowLo = Math.min(pi, si);
        const rowHi = Math.max(pi, si);
        for (let row = rowLo; row <= rowHi; row++) {
          const edgesForRow = barEdgesForRow(row);
          if (!edgesForRow) continue;
          clearOfLeftXs.push(edgesForRow.left);
          clearOfRightXs.push(edgesForRow.right);
        }

        edges.push({
          key: `${predId}->${task._id}:${type}`,
          predecessorId: predId,
          successorId: task._id,
          type,
          x1,
          y1,
          x2,
          y2,
          conflict: conflictIds.has(task._id),
          predecessorTitle: pred.title,
          entry: anchors.entry,
          exitLeft: type === "SF",
          clearOfLeftXs,
          clearOfRightXs,
        });
      }
    }

    return buildTrunkBranchDependencyPaths(edges, {
      trunkGap: 30,
      laneSpacing: 10,
    });
  }, [
    sortedTasks,
    taskIndex,
    previewDates,
    dayIndexForKey,
    days.length,
    dayWidth,
    conflictIds,
  ]);

  useEffect(() => {
    if (!linkDrag) return;

    const toChartPoint = (clientX: number, clientY: number) => {
      const chartEl = chartScrollRef.current;
      if (!chartEl) return { x: clientX, y: clientY };
      const rect = chartEl.getBoundingClientRect();
      return {
        x: clientX - rect.left + chartEl.scrollLeft,
        y: clientY - rect.top + chartEl.scrollTop,
      };
    };

    const onMove = (e: PointerEvent) => {
      const point = toChartPoint(e.clientX, e.clientY);
      setLinkDrag((current) =>
        current ? { ...current, x: point.x, y: point.y } : null
      );
    };

    const onUp = (e: PointerEvent) => {
      const current = linkDragRef.current;
      linkDragRef.current = null;
      setLinkDrag(null);
      if (!current) return;
      suppressBarClickRef.current = true;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest?.("[data-gantt-bar-id]") as HTMLElement | null;
      const successorId = target?.dataset?.ganttBarId;
      if (!successorId || successorId === current.predecessorId) return;

      const successor = tasks.find((t) => t._id === successorId);
      if (!successor) return;

      addDependency(
        successor,
        current.predecessorId,
        current.type,
        `${current.type} dependency linked`
      );
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [linkDrag, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLinkDrag = (
    e: React.PointerEvent,
    predecessorId: string
  ) => {
    if (
  !canManageDependencies ||
  savingId ||
  pendingSchedule
) {
  return;
}
    e.preventDefault();
    e.stopPropagation();
    const chartEl = chartScrollRef.current;
    let x = e.clientX;
    let y = e.clientY;
    if (chartEl) {
      const rect = chartEl.getBoundingClientRect();
      x = e.clientX - rect.left + chartEl.scrollLeft;
      y = e.clientY - rect.top + chartEl.scrollTop;
    }
    linkDragRef.current = { predecessorId, type: linkType };
    setLinkDrag({ predecessorId, type: linkType, x, y });
  };

  const openMilestoneForm = (
  mode: "create" | "edit",
  milestone?: MilestoneItem | null
) => {
  if (!canManageMilestones) {
    toast.error("You do not have permission to manage milestones");
    return;
  }
    setMilestoneDialog({ mode, milestone: milestone || null });
    setMilestoneTitle(milestone?.title || "");
    setMilestoneDescription(milestone?.description || "");
    setMilestoneDue(toDateKey(milestone?.dueDate) || format(today, "yyyy-MM-dd"));
    setMilestoneStatus(milestone?.status || "pending");
  };

  const saveMilestone = async () => {
    if (!canManageMilestones) {
      toast.error("You do not have permission to manage milestones");
      return;
    }

    const title = milestoneTitle.trim();
    if (!title) {
      toast.error("Milestone title is required");
      return;
    }
    if (!milestoneDue) {
      toast.error("Milestone due date is required");
      return;
    }
    setMilestoneSaving(true);
    try {
      const editing = milestoneDialog?.mode === "edit" ? milestoneDialog.milestone : null;
      const res = await authFetch(
        editing
          ? `/projects/${projectId}/milestones/${editing._id}`
          : `/projects/${projectId}/milestones`,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            title,
            description: milestoneDescription.trim(),
            dueDate: milestoneDue,
            status: milestoneStatus,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to save milestone");
      }
      const saved = data as MilestoneItem;
      const next = editing
        ? milestones.map((item) => (item._id === saved._id ? saved : item))
        : [...milestones, saved];
      onMilestonesChange?.(next);
      setMilestoneDialog(null);
      toast.success(editing ? "Milestone updated" : "Milestone created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const removeMilestone = async (milestone: MilestoneItem) => {
    if (!canManageMilestones) {
  toast.error("You do not have permission to manage milestones");
  return;
}
    const ok = await confirmDialog({
      title: "Delete milestone?",
      description: `"${milestone.title}" will be removed from this project.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await authFetch(
        `/projects/${projectId}/milestones/${milestone._id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to delete milestone");
      }
      onMilestonesChange?.(milestones.filter((item) => item._id !== milestone._id));
      setMilestoneDialog(null);
      toast.success("Milestone deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete milestone");
    }
  };

  const depsPanelTask = useMemo(
    () =>
      depsPanelTaskId
        ? sortedTasks.find((t) => t._id === depsPanelTaskId) || null
        : null,
    [depsPanelTaskId, sortedTasks]
  );
  const depsPanelList = depsPanelTask ? normalizeDeps(depsPanelTask) : [];

useEffect(() => {
  if (!projectId || !canAccessBaseline) {
    setSelectedBaselineId(null);
    setShowBaseline(false);
    return;
  }

  const stored = localStorage.getItem(`gantt-baseline:${projectId}`);

  if (stored && baselines.some((item) => item._id === stored)) {
    setSelectedBaselineId(stored);
  } else if (baselines.length > 0) {
    setSelectedBaselineId(baselines[0]._id);
  } else {
    setSelectedBaselineId(null);
  }
}, [projectId, baselines, canAccessBaseline]);

useEffect(() => {
  if (projectId && selectedBaselineId && canAccessBaseline) {
    localStorage.setItem(`gantt-baseline:${projectId}`, selectedBaselineId);
  }
}, [projectId, selectedBaselineId, canAccessBaseline]);

const baselineSummary = useMemo(
  () => summarizeBaselineSchedule(sortedTasks, selectedBaseline),
  [sortedTasks, selectedBaseline]
);

const openBaselineDialog = () => {
  if (!canManageBaseline) {
    toast.error("You do not have permission to manage baselines");
    return;
  }

  setBaselineName(`Baseline ${format(new Date(), "d MMM yyyy, HH:mm")}`);
  setBaselineDialogOpen(true);
};

const saveBaseline = async () => {
  if (!canManageBaseline) {
    toast.error("You do not have permission to manage baselines");
    return;
  }

  const name = baselineName.trim();

  if (!name) {
    toast.error("Baseline name is required");
    return;
  }

  setBaselineSaving(true);

  try {
    const res = await authFetch(`/projects/${projectId}/baselines`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || "Unable to save baseline");
    }

    const created = data as ScheduleBaseline;
    onBaselinesChange?.([created, ...baselines]);
    setSelectedBaselineId(created._id);
    setShowBaseline(true);
    setBaselineDialogOpen(false);
    toast.success("Schedule baseline saved");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to save baseline"
    );
  } finally {
    setBaselineSaving(false);
  }
};

const deleteSelectedBaseline = async () => {
  if (!canManageBaseline) {
    toast.error("You do not have permission to manage baselines");
    return;
  }

  if (!selectedBaseline) return;

  const ok = await confirmDialog({
    title: "Delete baseline?",
    description: `“${selectedBaseline.name}” will be permanently removed.`,
    confirmLabel: "Delete baseline",
    variant: "danger",
  });

  if (!ok) return;

  try {
    const res = await authFetch(
      `/projects/${projectId}/baselines/${selectedBaseline._id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || "Unable to delete baseline");
    }

    const remaining = baselines.filter(
      (item) => item._id !== selectedBaseline._id
    );
    onBaselinesChange?.(remaining);
    setSelectedBaselineId(remaining[0]?._id ?? null);
    toast.success("Baseline deleted");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to delete baseline"
    );
  }
};

  const chartWidth = days.length * dayWidth;
  const chartHeight = Math.max(sortedTasks.length * ROW_H, ROW_H);

  if (!canViewGantt) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Gantt access restricted
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            You do not have permission to view the Gantt chart for this project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {resourceWarnings.length > 0 && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <ul className="space-y-1">
              {resourceWarnings.slice(0, 4).map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {canViewConflicts &&
        (allScheduleConflicts.length > 0 || overdueMilestones.length > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              {allScheduleConflicts.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {allScheduleConflicts.length} schedule conflict
                      {allScheduleConflicts.length === 1 ? "" : "s"}
                    </p>
                    {allScheduleConflicts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConflictDialogOpen(true)}
                        className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20"
                      >
                        View conflicts
                      </button>
                    )}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs opacity-90">
  {allScheduleConflicts.slice(0, 2).map((conflict) => (
    <li key={conflict.id}>
      <span className="mr-1 font-semibold">
        {conflict.badge}:
      </span>
      {conflict.message}
    </li>
  ))}

  {allScheduleConflicts.length > 2 && (
    <li>
      …and {allScheduleConflicts.length - 2} more
    </li>
  )}
</ul>
                </div>
              )}
              {overdueMilestones.length > 0 && (
                <div>
                  <p className="font-medium">
                    {overdueMilestones.length} overdue milestone
                    {overdueMilestones.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                    {overdueMilestones.slice(0, 2).map((milestone) => (
                      <li key={milestone._id}>
                        “{milestone.title}” was due{" "}
                        {toDateKey(milestone.dueDate)} (
                        {milestoneStatusLabel(milestone.status)})
                      </li>
                    ))}
                    {overdueMilestones.length > 2 && (
                      <li>…and {overdueMilestones.length - 2} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {conflictDialogOpen &&
        canViewConflicts &&
        allScheduleConflicts.length > 0 && (
  <ModalShell
    onClose={() => {
      setConflictDialogOpen(false);
      setConflictFilter("all");
    }}
    maxWidth="4xl"
  >
    <div className="p-4 sm:p-8">
      <ModalHeader
        title="Schedule conflicts"
        subtitle={`${filteredScheduleConflicts.length} ${
          filteredScheduleConflicts.length === 1
            ? "conflict"
            : "conflicts"
        } shown`}
        onClose={() => {
          setConflictDialogOpen(false);
          setConflictFilter("all");
        }}
      />

      <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Filter conflicts
          </p>
        </div>

        <Select
          value={conflictFilter}
          onChange={(value) =>
            setConflictFilter(value as ConflictCategory | "all")
          }
          options={[
            {
              value: "all",
              label: `All conflicts (${conflictCounts.all})`,
            },
            {
              value: "dependency",
              label: `Dependency conflicts (${conflictCounts.dependency})`,
            },
            {
              value: "assignee",
              label: `Assignee conflicts (${conflictCounts.assignee})`,
            },
            {
              value: "deadline",
              label: `Deadline conflicts (${conflictCounts.deadline})`,
            },
            {
              value: "baseline",
              label: `Baseline variance (${conflictCounts.baseline})`,
            },
            {
              value: "circular",
              label: `Circular dependency (${conflictCounts.circular})`,
            },
          ]}
          ariaLabel="Filter schedule conflicts"
          triggerClassName="flex min-w-[240px] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          menuClassName="min-w-[260px]"
          menuZIndexClassName="z-[160]"
        />
      </div>

      {filteredScheduleConflicts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          No conflicts match the selected filter.
        </div>
      ) : (
        <ul className="max-h-[min(60vh,560px)] space-y-3 overflow-y-auto pr-1">
          {filteredScheduleConflicts.map((conflict) => {
            const badgeClass =
              conflict.category === "circular"
                ? "bg-red-600"
                : conflict.category === "assignee"
                  ? "bg-orange-600"
                  : conflict.category === "deadline"
                    ? "bg-rose-600"
                    : conflict.category === "baseline"
                      ? "bg-indigo-600"
                      : "bg-amber-600";

            return (
              <li
                key={conflict.id}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
              >
                <span
                  className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${badgeClass}`}
                >
                  {conflict.badge}
                </span>

                {conflict.message}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </ModalShell>
)}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setRangeStart((d) => addDays(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="min-w-[5.5rem] rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Jump back to today"
            onClick={() => {
              setRangeStart(startOfDay(addDays(today, -7)));
              setRangeDays(42);
            }}
          >
            {formatGanttNavLabel(rangeStart, today)}
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setRangeStart((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            disabled={dayWidth <= DAY_MIN}
            onClick={() => setDayWidth((w) => Math.max(DAY_MIN, w - 8))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            disabled={dayWidth >= DAY_MAX}
            onClick={() => setDayWidth((w) => Math.min(DAY_MAX, w + 8))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

{canViewCriticalPath && (
        <button
          type="button"
          aria-pressed={showCriticalPath}
          title="Highlight tasks with no slack that determine the project finish"
          onClick={() => setShowCriticalPath((on) => !on)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
            showCriticalPath
              ? "border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-200"
              : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          }`}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-600"
            aria-hidden
          />
          {showCriticalPath ? "Hide critical path" : "Show critical path"}
        </button>
)}


<div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
  {canManageBaseline && (
    <button
      type="button"
      onClick={openBaselineDialog}
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <CalendarPlus size={16} />
Save new baseline
    </button>
  )}

 {canAccessBaseline && (
 <Select
  value={selectedBaselineId ?? ""}
  onChange={(value) => {
  const nextBaselineId = value || null;

  setSelectedBaselineId(nextBaselineId);
  setShowBaseline(Boolean(nextBaselineId));

  if (nextBaselineId && typeof window !== "undefined") {
    const helperKey = `gantt-baseline-helper:${projectId}`;

    if (!localStorage.getItem(helperKey)) {
      setShowBaselineHelper(true);
      localStorage.setItem(helperKey, "1");
    }
  }
}}
  options={[
    { value: "", label: "No baseline" },
    ...baselines.map((baseline) => ({
      value: baseline._id,
      label: baseline.name,
    })),
  ]}
  ariaLabel="Choose baseline schedule to compare"
  className="min-w-[210px]"
  triggerClassName={(open) =>
    `flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm transition ${
      open
        ? "border-cyan-500 bg-white ring-4 ring-cyan-100 dark:bg-slate-800 dark:ring-cyan-500/20"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
    }`
  }
/>
 )}
  {selectedBaseline && canViewBaseline && (
    <>
      <button
  type="button"
  aria-pressed={showBaseline}
  onClick={() => setShowBaseline((value) => !value)}
  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
    showBaseline
      ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/20"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  }`}
>
  Compare schedule: {showBaseline ? "On" : "Off"}
</button>

      {canManageBaseline && (
        <button
          type="button"
          onClick={() => void deleteSelectedBaseline()}
          className="rounded-lg px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          Delete
        </button>
      )}
    </>
  )}
</div>

       {canManageMilestones && (
          <button
            type="button"
            onClick={() => openMilestoneForm("create")}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <Plus size={16} />
            Add milestone
          </button>
        )}

        {canManageDependencies && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {(Object.keys(DEPENDENCY_TYPE_META) as DependencyType[]).map(
              (type) => (
                <button
                  key={type}
                  type="button"
                  title={DEPENDENCY_TYPE_META[type].hint}
                  onClick={() => setLinkType(type)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
                    linkType === type
                      ? "text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                  style={
                    linkType === type
                      ? { backgroundColor: DEPENDENCY_TYPE_META[type].color }
                      : undefined
                  }
                >
                  {type}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() =>
                setLinkFromId((id) => {
                  if (id) return null;
                  toast.info(
                    `Click a successor task, then its predecessor (${linkType})`
                  );
                  return "__pick__";
                })
              }
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                linkFromId
                  ? "border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-300"
                  : "border-transparent text-slate-700 dark:text-slate-200"
              }`}
            >
              <GitBranch size={16} />
              {linkFromId === "__pick__"
                ? "Pick successor…"
                : linkFromId
                  ? "Pick predecessor…"
                  : `Link ${linkType}`}
            </button>
          </div>
        )}

        {linkFromId && linkFromId !== "__pick__" && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Linking onto{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {tasks.find((t) => t._id === linkFromId)?.title || "task"}
            </span>
            — click the predecessor ({linkType}), or cancel.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setLinkFromId(null)}
            >
              Cancel
            </button>
          </p>
        )}
      </div>


{canViewBaseline && selectedBaseline && showBaseline && (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Schedule comparison
        </p>

        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Comparing the current schedule with “{selectedBaseline.name}”.
          Dates are not changed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-cyan-500" />
          Current plan
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm border border-slate-400"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(100,116,139,.25) 0, rgba(100,116,139,.25) 3px, transparent 3px, transparent 6px)",
            }}
          />
          Saved baseline
        </span>

        <span className="text-emerald-700 dark:text-emerald-300">
          {baselineSummary.ahead} ahead
        </span>

        <span className="text-slate-600 dark:text-slate-300">
          {baselineSummary.onPlan} on plan
        </span>

        <span className="text-rose-700 dark:text-rose-300">
          {baselineSummary.late} late
        </span>

        <span className="text-slate-500 dark:text-slate-400">
          {baselineSummary.noBaseline} not in baseline
        </span>
      </div>
    </div>
  </div>
)}

{canViewBaseline && showBaselineHelper && selectedBaseline && (
  <div className="flex items-start gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100">
    <div className="min-w-0 flex-1">
      <p className="font-medium">
        You are comparing the current schedule with “{selectedBaseline.name}”.
      </p>

      <p className="mt-1 text-xs text-cyan-800 dark:text-cyan-200">
        Blue = current plan · Grey striped = saved baseline · Dates are not
        changed.
      </p>
    </div>

    <button
      type="button"
      className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium hover:bg-cyan-100 dark:hover:bg-cyan-500/20"
      onClick={() => setShowBaselineHelper(false)}
    >
      Got it
    </button>
  </div>
)}

      {depsPanelTask && canManageDependencies && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Dependencies for “{depsPanelTask.title}”
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Remove a link below, or clear all. You can also click an arrow on
                the chart to delete it.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={() => setDepsPanelTaskId(null)}
              aria-label="Close dependencies panel"
            >
              <X size={16} />
            </button>
          </div>

          {depsPanelList.length === 0 ? (
            <p className="text-sm text-slate-500">No dependencies on this task.</p>
          ) : (
            <ul className="space-y-2">
              {depsPanelList.map((dep) => {
                const predId = dependencyPredecessorId(dep);
                if (!predId) return null;
                const title = predecessorTitle(dep);
                const type = (dep.type || "FS").toUpperCase();
                const lag = Number(dep.lagDays) || 0;
                const lagLabel =
                  lag === 0 ? "" : lag > 0 ? ` +${lag}d lag` : ` ${lag}d lead`;
                return (
                  <li
                    key={`${depsPanelTask._id}-${predId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
                      <span
                        className="mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{
                          backgroundColor:
                            DEPENDENCY_TYPE_META[
                              type === "SS" || type === "FF" || type === "SF"
                                ? type
                                : "FS"
                            ].color,
                        }}
                      >
                        {type}
                      </span>
                      {DEPENDENCY_TYPE_META[
                        type === "SS" || type === "FF" || type === "SF"
                          ? type
                          : "FS"
                      ].label}
                      {lagLabel}
                      <span className="text-slate-400"> from </span>
                      <span className="font-medium">{title}</span>
                    </div>
                    <button
                      type="button"
                      disabled={savingId === depsPanelTask._id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      onClick={() =>
                        void removeDependency(depsPanelTask, predId, {
                          predecessorTitle: title,
                        })
                      }
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {depsPanelList.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={savingId === depsPanelTask._id}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                onClick={() => void clearAllDependencies(depsPanelTask)}
              >
                <Unlink size={13} />
                Remove all dependencies
              </button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Split layout: task table never shares a scrollport with bars */}
        <div className="flex max-h-[min(70vh,720px)] min-h-[280px]">
          {/* Left: synced task table */}
          <div
            className="relative z-20 flex shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            style={{ width: TABLE_W }}
          >
            <div className="shrink-0 overflow-x-auto border-b border-slate-200 dark:border-slate-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div
                className="grid items-center gap-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                style={{
                  gridTemplateColumns:
                    "28px minmax(120px,1.4fr) 78px 78px 82px minmax(88px,1fr) 84px",
                  minWidth: 540,
                }}
              >
                <span>#</span>
                <span>Task</span>
                <span>Start</span>
                <span>Due</span>
                <span>Variance</span>
                <span>Predecessor</span>
                <span>Assignee</span>
              </div>
            </div>
            <div
              ref={labelScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-auto"
              onScroll={(e) =>
                syncVerticalScroll("labels", e.currentTarget.scrollTop)
              }
            >
              {sortedTasks.length === 0 ? (
                <div className="px-4 py-10 text-sm text-slate-500">
                  No tasks yet. Create tasks with start and due dates to see them
                  on the Gantt.
                </div>
              ) : (
                sortedTasks.map((task, index) => {
                  const rowNum = index + 1;
                  const startKey = toDateKey(task.startDate);
                  const dueKey = toDateKey(task.dueDate);
                  const deps = normalizeDeps(task);
                  const predLabel = formatPredecessorCell(deps, rowByTaskId);
                  const isEditingPred = editingPredTaskId === task._id;
                  const isLinkTarget =
                    linkFromId === "__pick__" ||
                    (linkFromId && linkFromId !== task._id);
                  const assignees =
                    task.assignees?.length
                      ? task.assignees
                      : task.assignee
                        ? [task.assignee]
                        : [];
                  const slack = criticalPath.metricsByTaskId.get(task._id);
                  const isCritical =
                    showCriticalPath &&
                    criticalPath.criticalTaskIds.has(task._id);
const baselineItem = baselineItemForTask(selectedBaseline, task._id);
const variance = calculateTaskVariance(task, baselineItem);

                  return (
                    <div
                      key={task._id}
                      className={`relative grid items-center gap-1 border-b border-slate-100 px-2 dark:border-slate-800 ${
                        conflictIds.has(task._id)
                          ? "bg-amber-50/70 dark:bg-amber-500/5"
                          : "bg-white dark:bg-slate-900"
                      } ${
                        linkFromId === task._id
                          ? "bg-cyan-50 dark:bg-cyan-400/10"
                          : ""
                      } ${
                        selectedTask?._id === task._id
                          ? "bg-amber-50/80 dark:bg-amber-500/10"
                          : ""
                      } ${
                        isLinkTarget
                          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      }`}
                      style={{
                        height: ROW_H,
                        gridTemplateColumns:
                          "28px minmax(120px,1.4fr) 78px 78px 82px minmax(88px,1fr) 84px",
                        minWidth: 540,
                      }}
                      onClick={() => {
                        if (editingPredTaskId) return;
                        if (linkFromId === "__pick__") {
                          setLinkFromId(task._id);
                          return;
                        }
                        handleRowClick(task);
                      }}
                    >
                      <span className="truncate text-[11px] tabular-nums text-slate-400">
                        {rowNum}
                      </span>
                      <div className="min-w-0 overflow-hidden">
                        <p
                          className="truncate text-[13px] font-medium leading-tight text-slate-800 dark:text-slate-100"
                          title={
                            slack
                              ? `${task.title} · ${formatSlackLabel(slack.totalFloat)}`
                              : task.title
                          }
                        >
                          {task.title}
                        </p>
                        {slack && (
                          <p
                            className={`truncate text-[10px] leading-tight ${
                              isCritical
                                ? "font-medium text-orange-700 dark:text-orange-300"
                                : "text-slate-400"
                            }`}
                          >
                            {formatSlackLabel(slack.totalFloat)}
                          </p>
                        )}
                      </div>
                      <span className="truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {startKey || "—"}
                      </span>
                      <span className="truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {dueKey || "—"}
                      </span>

                      <span
                        className={`truncate text-[11px] tabular-nums ${
                          !canViewBaseline || !selectedBaseline || !variance
                            ? "text-slate-400"
                            : variance.finishVarianceDays > 0
                              ? "text-rose-700 dark:text-rose-300"
                              : variance.finishVarianceDays < 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-slate-500 dark:text-slate-400"
                        }`}
                        title={
                          !canViewBaseline
                            ? "You do not have permission to view the baseline"
                            : variance
                              ? `Start: ${formatVariance(variance.startVarianceDays)}; Finish: ${formatVariance(variance.finishVarianceDays)}`
                              : selectedBaseline
                                ? "No matching scheduled baseline item"
                                : "Select a baseline to compare"
                        }
                      >
                        {!canViewBaseline || !selectedBaseline || !variance
                          ? "—"
                          : variance.finishVarianceDays > 0
                            ? `↓ ${variance.finishVarianceDays}d late`
                            : variance.finishVarianceDays < 0
                              ? `↑ ${Math.abs(variance.finishVarianceDays)}d ahead`
                              : "✓ On plan"}
                      </span>

                      <div
                        className="min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canManageDependencies && isEditingPred ? (
                          <div className="relative">
                            <input
                              autoFocus
                              aria-label={`Predecessors for ${task.title}`}
                              className={`w-full rounded border bg-white px-1.5 py-0.5 text-[11px] outline-none dark:bg-slate-950 ${
                                predError
                                  ? "border-rose-400 focus:border-rose-500"
                                  : "border-cyan-400 focus:border-cyan-500"
                              }`}
                              value={predDraft}
                              disabled={savingId === task._id}
                              placeholder="e.g. 12FS, 14SS, 8FF"
                              onChange={(e) => {
                                setPredDraft(e.target.value);
                                setPredError(null);
                              }}
                              onBlur={() => {
                                void commitPredecessorEdit(task);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitPredecessorEdit(task);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelPredecessorEdit();
                                }
                              }}
                            />
                            {predError && (
                              <p className="absolute left-0 top-full z-30 mt-0.5 max-w-[220px] rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 shadow dark:bg-rose-950 dark:text-rose-300">
                                {predError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!canManageDependencies || Boolean(savingId)}
                            title={
                              canManageDependencies
                                ? "Edit predecessors (row numbers, e.g. 12FS, 14SS, 8FF+1)"
                                : predLabel || "No predecessors"
                            }
                            className={`w-full truncate rounded px-1 py-0.5 text-left text-[11px] tabular-nums ${
                              canManageDependencies
                                ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                : "text-slate-500"
                            } ${!predLabel ? "text-slate-300 dark:text-slate-600" : ""}`}
                            onClick={() => beginPredecessorEdit(task)}
                          >
                            {predLabel || "—"}
                          </button>
                        )}
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        {assignees.length > 0 ? (
                          <AssigneeAvatars assignees={assignees} max={2} />
                        ) : (
                          <span className="text-[11px] text-slate-300 dark:text-slate-600">
                            —
                          </span>
                        )}
                        {canManageDependencies && deps.length > 0 && (
                          <button
                            type="button"
                            title="Manage dependencies"
                            className={`ml-auto shrink-0 rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              depsPanelTaskId === task._id
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-400 hover:text-rose-500"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDepsPanelTaskId((id) =>
                                id === task._id ? null : task._id
                              );
                            }}
                          >
                            <Unlink size={12} />
                          </button>
                        )}
                        
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: timeline only (bars clipped here) */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={headerScrollRef}
              className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-slate-200 dark:border-slate-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) =>
                syncHorizontalScroll("header", e.currentTarget.scrollLeft)
              }
            >
              <div className="flex" style={{ width: chartWidth }}>
                {days.map((day) => {
                  const weekend = isWeekend(day);
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`shrink-0 border-r border-slate-100 py-2 text-center text-[10px] dark:border-slate-800 ${
                        weekend
                          ? "bg-slate-50 text-slate-400 dark:bg-slate-950/50"
                          : "bg-white text-slate-500 dark:bg-slate-900"
                      } ${
                        isToday
                          ? "bg-cyan-50 font-semibold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"
                          : ""
                      }`}
                      style={{ width: dayWidth }}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div>{format(day, "d")}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              ref={chartScrollRef}
              className="min-h-0 flex-1 overflow-auto"
              onScroll={(e) => {
                syncHorizontalScroll("chart", e.currentTarget.scrollLeft);
                syncVerticalScroll("chart", e.currentTarget.scrollTop);
              }}
            >
              <div
                className="relative"
                style={{ width: chartWidth, height: chartHeight }}
              >
                <div className="pointer-events-none absolute inset-0 flex">
                  {days.map((day) => (
                    <div
                      key={`bg-${day.toISOString()}`}
                      className={`h-full border-r border-slate-100 dark:border-slate-800/80 ${
                        isWeekend(day)
                          ? "bg-slate-50/80 dark:bg-slate-950/40"
                          : ""
                      } ${
                        isSameDay(day, today)
                          ? "bg-cyan-50/50 dark:bg-cyan-400/5"
                          : ""
                      }`}
                      style={{ width: dayWidth }}
                    />
                  ))}
                </div>

                <svg
                  className="absolute inset-0"
                  width={chartWidth}
                  height={chartHeight}
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    {(Object.keys(DEPENDENCY_TYPE_META) as DependencyType[]).map(
                      (type) => (
                        <marker
                          key={type}
                          id={`gantt-arrow-${type}`}
                          markerWidth="8"
                          markerHeight="8"
                          refX="6"
                          refY="3"
                          orient="auto"
                        >
                          <path
                            d="M0,0 L6,3 L0,6 Z"
                            fill={DEPENDENCY_TYPE_META[type].color}
                          />
                        </marker>
                      )
                    )}
                    <marker
                      id="gantt-arrow-conflict"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="#D97706" />
                    </marker>
                  </defs>
                  {linkPaths.map((p) => {
                    const type = p.type || "FS";
                    const meta = DEPENDENCY_TYPE_META[type] || DEPENDENCY_TYPE_META.FS;
                    const color = meta.color;
                    return (
                    <g key={p.key}>
                      {canManageDependencies && (
                        <path
                          d={p.d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={12}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            const task = tasks.find(
                              (t) => t._id === p.successorId
                            );
                            if (!task) return;
                            void removeDependency(task, p.predecessorId, {
                              predecessorTitle: p.predecessorTitle,
                            });
                          }}
                        >
                          <title>
                            {type}: {meta.label}. Click to remove{" "}
                            {p.predecessorTitle} → successor
                          </title>
                        </path>
                      )}
                      <path
                        d={p.d}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeDasharray={p.conflict ? "5 3" : undefined}
                        markerEnd={`url(#gantt-arrow-${type})`}
                        opacity={0.95}
                        className="pointer-events-none"
                      />
                      <circle
                        cx={p.x2}
                        cy={p.y2}
                        r={4}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                        className="pointer-events-none"
                      >
                        <title>
                          {type} attaches at the successor{" "}
                          {type === "FF" || type === "SF" ? "finish" : "start"}
                        </title>
                      </circle>
                    </g>
                    );
                  })}
                  {linkDrag &&
                    (() => {
                      const predIndex = taskIndex.get(linkDrag.predecessorId);
                      const pred = sortedTasks.find(
                        (t) => t._id === linkDrag.predecessorId
                      );
                      if (predIndex == null || !pred) return null;
                      const dates = previewDates(pred);
                      const fromStart =
                        dependencyAnchors(linkDrag.type).from === "start";
                      const key = fromStart ? dates.start : dates.due;
                      if (!key) return null;
                      const predDay = dayIndexForKey(key);
                      if (predDay < 0 || predDay >= days.length) return null;
                      const x1 = fromStart
                        ? predDay * dayWidth + 2
                        : predDay * dayWidth + dayWidth - 2;
                      const y1 = predIndex * ROW_H + LIVE_ROW_H / 2;
                      const d = orthogonalDependencyPath(
                        x1,
                        y1,
                        linkDrag.x,
                        linkDrag.y
                      );
                      return (
                        <path
                          d={d}
                          fill="none"
                          stroke={DEPENDENCY_TYPE_META[linkDrag.type].color}
                          strokeWidth={1.75}
                          strokeDasharray="4 3"
                          opacity={0.95}
                          className="pointer-events-none"
                        />
                      );
                    })()}
                </svg>

                <div className="pointer-events-none absolute inset-0 z-[4]">
                  {milestones.map((milestone, milestoneIndex) => {
                    const due = toDateKey(milestone.dueDate);
                    if (!due) return null;
                    const day = dayIndexForKey(due);
                    if (day < 0 || day >= days.length) return null;
                    const sameDayBefore = milestones
                      .slice(0, milestoneIndex)
                      .filter((item) => toDateKey(item.dueDate) === due).length;
                    const overdue =
                      milestone.status !== "completed" &&
                      due < format(today, "yyyy-MM-dd");
                    const color = overdue
                      ? "#E11D48"
                      : milestone.status === "completed"
                        ? "#059669"
                        : milestone.status === "in-progress"
                          ? "#D97706"
                          : "#7C3AED";
                    const label = `${milestone.title}, ${milestoneStatusLabel(milestone.status)}, ${format(parseKey(due), "d MMM yyyy")}`;
                    return (
                      <button
                        key={milestone._id}
                        type="button"
                        className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-2 border-white shadow-sm"
                        style={{
                          left: day * dayWidth + dayWidth / 2 + sameDayBefore * 12,
                          top: 3 + sameDayBefore * 6,
                          backgroundColor: color,
                        }}
                        aria-label={label}
                        title={label}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openMilestoneForm("edit", milestone);
                        }}
                      />
                    );
                  })}
                </div>

                {sortedTasks.map((task, index) => {
                  const { start, due } = previewDates(task);
                  const assignees =
                    task.assignees?.length
                      ? task.assignees
                      : task.assignee
                        ? [task.assignee]
                        : [];
                  const chartAssignees = assignees.slice(0, 3);

                  if (!start || !due) {
                    return (
                      <div
                        key={task._id}
                        className="absolute flex items-center gap-1.5 px-2 text-[11px] text-slate-400"
                        style={{
                          top: index * ROW_H,
                          height: ROW_H,
                          left: 8,
                        }}
                      >
                        {chartAssignees.length > 0 && (
                          <span className="flex -space-x-1.5">
                            {chartAssignees.map((person) => {
                              const bg = avatarBg(
                                person.avatarColor,
                                person._id || person.username
                              );
                              return (
                                <span
                                  key={person._id}
                                  title={person.username}
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-white text-[8px] font-bold text-white shadow-sm dark:border-slate-900 ${bg.className}`}
                                  style={bg.style}
                                >
                                  {avatarInitials(person.username)}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        Set start &amp; due dates to schedule
                      </div>
                    );
                  }

                  let startIdx = dayIndexForKey(start);
                  let endIdx = dayIndexForKey(due);
                  if (endIdx < 0 || startIdx >= days.length) return null;

                  const clipped = startIdx < 0 || endIdx >= days.length;
                  startIdx = Math.max(0, startIdx);
                  endIdx = Math.min(days.length - 1, endIdx);
                  const left = startIdx * dayWidth + 2;
                  const width = Math.max(
                    dayWidth - 4,
                    (endIdx - startIdx + 1) * dayWidth - 4
                  );
                  const color = barColor(task.status, task.priority);
                  const slack = criticalPath.metricsByTaskId.get(task._id);
                  const isCritical =
                    showCriticalPath && criticalPath.criticalTaskIds.has(task._id);
                  const slackLabel = slack
                    ? formatSlackLabel(slack.totalFloat)
                    : null;
                    const baselineItem = baselineItemForTask(selectedBaseline, task._id);
                  const isDragging =
                    drag?.taskId === task._id ||
                    pendingSchedule?.taskId === task._id;
                  const dragLocked = Boolean(pendingSchedule || savingId);
                  const isLinkSource =
                    linkDrag?.predecessorId === task._id ||
                    linkFromId === task._id;
                  const avatarStackW = chartAssignees.length
                    ? 8 + chartAssignees.length * 14
                    : 0;

                  return (
                    <div key={task._id} className="contents">
                      {chartAssignees.length > 0 && (
                        <div
                          className="pointer-events-none absolute z-[1] flex items-center"
                          style={{
                            left: Math.max(2, left - avatarStackW - 4),
                            top: index * ROW_H,
                            height: LIVE_ROW_H,
                          }}
                          aria-hidden
                        >
                          <span className="flex -space-x-1.5">
                            {chartAssignees.map((person) => {
                              const bg = avatarBg(
                                person.avatarColor,
                                person._id || person.username
                              );
                              return (
                                <span
                                  key={person._id}
                                  title={person.username}
                                  className={`pointer-events-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-white text-[8px] font-bold text-white shadow-sm dark:border-slate-900 ${bg.className}`}
                                  style={bg.style}
                                >
                                  {avatarInitials(person.username)}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      )}

                      {canViewBaseline && showBaseline && selectedBaseline && baselineItem && (() => {
  let baselineStart = dayIndexForKey(
    baselineItem.startDate.slice(0, 10)
  );
  let baselineEnd = dayIndexForKey(
    baselineItem.dueDate.slice(0, 10)
  );

  if (baselineEnd < 0 || baselineStart >= days.length) {
    return null;
  }

  baselineStart = Math.max(0, baselineStart);
  baselineEnd = Math.min(days.length - 1, baselineEnd);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute rounded-sm border border-slate-400/80 dark:border-slate-500/80"
      style={{
        left: baselineStart * dayWidth + 4,
        width: Math.max(
          dayWidth - 8,
          (baselineEnd - baselineStart + 1) * dayWidth - 8
        ),
        top: index * ROW_H + LIVE_ROW_H + 3,
        height: BASELINE_ROW_H - 6,
        zIndex: 1,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(100,116,139,.28) 0, rgba(100,116,139,.28) 3px, transparent 3px, transparent 6px)",
      }}
    />
  );
})()}

{canViewBaseline && showBaseline && selectedBaseline && !baselineItem && (
  <div
    className="pointer-events-none absolute flex items-center text-[9px] font-medium text-slate-400 dark:text-slate-500"
    style={{
      left: 6,
      top: index * ROW_H + LIVE_ROW_H,
      height: BASELINE_ROW_H,
      zIndex: 1,
    }}
  >
    Not in baseline
  </div>
)}


                      <div
                        data-gantt-bar-id={task._id}
                        aria-label={
                          slackLabel
                            ? `${task.title}, ${start} to ${due}, ${slackLabel}`
                            : `${task.title}, ${start} to ${due}`
                        }
                        className={`absolute flex items-center rounded-md text-white shadow-sm ${
                          isDragging || isLinkSource
                            ? "ring-2 ring-amber-400"
                            : ""
                        } ${
                          conflictIds.has(task._id)
                            ? "ring-2 ring-amber-400"
                            : ""
                        } ${
                          isCritical && !isDragging && !isLinkSource
                            ? "ring-2 ring-orange-600"
                            : ""
                        } ${
                          canEditSchedule && !dragLocked && !linkDrag
                              ? "cursor-grab active:cursor-grabbing"
                               : "cursor-pointer"
                        } ${savingId === task._id ? "opacity-60" : ""}`}
                        style={{
                          left,
                          width,
                           height: LIVE_ROW_H - 10,
                          top: index * ROW_H + 5,
                          backgroundColor: color,
                          opacity: clipped ? 0.85 : 1,
                          zIndex: isDragging || isLinkSource ? 2 : 1,
                          boxShadow: isCritical
                            ? "inset 4px 0 0 #DC2626, 0 0 0 2px #EA580C"
                            : undefined,
                        }}
                        title={
                          slackLabel
                            ? `${task.title}\n${start} → ${due}\n${slackLabel}\nEarly ${slack?.earliestStart} → ${slack?.earliestFinish}\nLate ${slack?.latestStart} → ${slack?.latestFinish}`
                            : `${task.title}\n${start} → ${due}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suppressBarClickRef.current) {
                            suppressBarClickRef.current = false;
                            return;
                          }
                          if (pendingSchedule || savingId || linkDrag) return;
                          if (linkFromId) {
                            handleRowClick(task);
                            return;
                          }
                          setSelectedTask(task);
                          onTaskUrlChange?.(task._id, null);
                        }}
                        onPointerDown={(e) => {
                          if (dragLocked || linkDrag) return;
                          onBarPointerDown(e, task, "move");
                        }}
                      >
                       {canEditSchedule && !dragLocked && (
                          <span
                            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md hover:bg-black/20"
                            onPointerDown={(e) =>
                              onBarPointerDown(e, task, "resize-start")
                            }
                          />
                        )}
                        <span className="truncate px-2 text-[11px] font-medium">
                          {task.title}
                        </span>
                        {canEditSchedule && !dragLocked && (
                          <span
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md hover:bg-black/20"
                            onPointerDown={(e) =>
                              onBarPointerDown(e, task, "resize-end")
                            }
                          />
                        )}
                        {canManageDependencies && !dragLocked && (
                          <button
                            type="button"
                            aria-label={`Drag to link a ${linkType} dependency from ${task.title}`}
                            title={`Drag to another bar to create a ${linkType} dependency`}
                            className="absolute -right-1.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow hover:scale-110"
                            style={{
                              backgroundColor: DEPENDENCY_TYPE_META[linkType].color,
                            }}
                            onPointerDown={(e) => startLinkDrag(e, task._id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {canEditSchedule && (
          <>
            Drag bars to reschedule (you’ll confirm before saving). Drag edges to
            resize.
          </>
        )}
        {canManageDependencies && (
          <>
            {canEditSchedule ? " " : ""}
            Edit the <span className="font-medium">Predecessor</span> column
            with row numbers and type (e.g.{" "}
            <span className="font-medium">12FS, 14SS, 8FF, 3SF+1</span>
            ). Select FS, SS, FF, or SF, then drag the dot on a bar onto another
            bar to create that dependency. Click a chart connector to remove it.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
       {canViewBaseline && selectedBaseline && showBaseline && (
  <>
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-5 rounded-sm bg-cyan-500"
        aria-hidden
      />
      <span className="font-medium text-slate-600 dark:text-slate-300">
        Current plan
      </span>
    </span>

    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-5 rounded-sm border border-slate-400"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(100,116,139,.28) 0, rgba(100,116,139,.28) 3px, transparent 3px, transparent 6px)",
        }}
        aria-hidden
      />
      <span className="font-medium text-slate-600 dark:text-slate-300">
        Saved baseline
      </span>
    </span>
  </>
)}
       
        {(Object.keys(DEPENDENCY_TYPE_META) as DependencyType[]).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: DEPENDENCY_TYPE_META[type].color }}
            />
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {type}
            </span>
            {DEPENDENCY_TYPE_META[type].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-orange-600 ring-2 ring-orange-600"
            aria-hidden
          />
          <span className="font-medium text-slate-600 dark:text-slate-300">
            Critical path
          </span>
          zero slack
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rotate-45 bg-violet-600"
            aria-hidden
          />
          Milestone
        </span>
      </div>

      {milestoneDialog && canManageMilestones && (
        <ModalShell
          onClose={() => {
            if (!milestoneSaving) setMilestoneDialog(null);
          }}
          maxWidth="lg"
        >
          <div className="p-5 sm:p-6">
            <ModalHeader
              title={
                milestoneDialog.mode === "edit" ? "Edit milestone" : "Add milestone"
              }
              subtitle="Milestones appear as diamonds on the Gantt due date."
              onClose={() => {
                if (!milestoneSaving) setMilestoneDialog(null);
              }}
            />
            <div className="space-y-3">
              <label className="block text-sm text-slate-700 dark:text-slate-200">
                Title
                <input
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-sm text-slate-700 dark:text-slate-200">
                Description
                <textarea
                  value={milestoneDescription}
                  onChange={(e) => setMilestoneDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Due date
                  <ThemedDatePicker
  value={milestoneDue}
  onChange={setMilestoneDue}
  placeholder="Choose due date"
  className="mt-1"
/>
                </label>
                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Status
                  <Select
  value={milestoneStatus}
  onChange={(value) => setMilestoneStatus(value as MilestoneStatus)}
  options={[
    { value: "pending", label: "Pending" },
    { value: "in-progress", label: "In progress" },
    { value: "completed", label: "Completed" },
  ]}
  ariaLabel="Milestone status"
  className="mt-1 w-full"
  triggerClassName={(open) =>
    `flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm transition ${
      open
        ? "border-cyan-500 bg-white ring-4 ring-cyan-100 dark:bg-slate-800 dark:ring-cyan-500/20"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    }`
  }
/>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {milestoneDialog.milestone ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    onClick={() =>
                      void removeMilestone(milestoneDialog.milestone as MilestoneItem)
                    }
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={() => setMilestoneDialog(null)}
                    disabled={milestoneSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={milestoneSaving}
                    onClick={() => void saveMilestone()}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {milestoneSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {baselineDialogOpen && canManageBaseline && (
  <ModalShell onClose={() => setBaselineDialogOpen(false)} maxWidth="md">
    <div className="p-5">
      <ModalHeader
        title="Save schedule baseline"
        subtitle="This captures the current dates of scheduled, non-deleted tasks."
        onClose={() => setBaselineDialogOpen(false)}
      />

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Baseline name
        <input
          autoFocus
          value={baselineName}
          maxLength={120}
          onChange={(event) => setBaselineName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveBaseline();
          }}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setBaselineDialogOpen(false)}
          className="btn btn-ghost"
          disabled={baselineSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void saveBaseline()}
          className="btn btn-primary"
          disabled={baselineSaving}
        >
          {baselineSaving ? "Saving…" : "Save baseline"}
        </button>
      </div>
    </div>
  </ModalShell>
)}

      {selectedTask && (
        <TaskDetailDialog
          projectId={projectId}
          task={selectedTask}
          customFields={customFields}
          otherCustomFields={otherCustomFields}
          cardPreviewConfig={cardPreviewConfig}
          adoptedCustomFieldIds={adoptedCustomFieldIds}
          isPersonalProject={!organizationId}
          canEdit={canEdit}
          organizationId={organizationId}
          statusOptions={buildStatusOptions(customStatuses)}
          activeSubtaskId={
            selectedTask._id === initialTaskId ? initialSubtaskId : null
          }
          onClose={() => {
            setSelectedTask(null);
            onTaskUrlChange?.(null);
          }}
          onUpdated={(updated) => {
            onTasksChange(
              tasks.map((t) => (t._id === updated._id ? { ...t, ...updated } : t))
            );
            setSelectedTask((current) =>
              current && current._id === updated._id
                ? { ...current, ...updated }
                : current
            );
          }}
          onDeleted={(taskId) => {
            onTasksChange(tasks.filter((t) => t._id !== taskId));
            setSelectedTask(null);
            onTaskUrlChange?.(null);
          }}
        />
      )}
    </div>
  );
}
