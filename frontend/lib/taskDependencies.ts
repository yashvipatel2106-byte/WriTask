import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type DependencyAnchor = "start" | "finish";

/** Connector colors and labels for the four standard precedence types. */
export const DEPENDENCY_TYPE_META: Record<
  DependencyType,
  { label: string; short: string; color: string; hint: string }
> = {
  FS: {
    label: "Finish to Start",
    short: "FS",
    color: "#64748B",
    hint: "Successor starts after the predecessor finishes",
  },
  SS: {
    label: "Start to Start",
    short: "SS",
    color: "#0F766E",
    hint: "Successor starts when the predecessor starts",
  },
  FF: {
    label: "Finish to Finish",
    short: "FF",
    color: "#7C3AED",
    hint: "Successor finishes when the predecessor finishes",
  },
  SF: {
    label: "Start to Finish",
    short: "SF",
    color: "#EA580C",
    hint: "Successor finishes when the predecessor starts",
  },
};

export function isDependencyType(value: string): value is DependencyType {
  return value === "FS" || value === "SS" || value === "FF" || value === "SF";
}

/** Which bar ends a dependency leaves and enters. Arrow always points at the successor end. */
export function dependencyAnchors(type: DependencyType | string | undefined): {
  from: DependencyAnchor;
  to: DependencyAnchor;
  entry: "left" | "right";
} {
  const t = String(type || "FS").toUpperCase();
  if (t === "SS") return { from: "start", to: "start", entry: "left" };
  if (t === "FF") return { from: "finish", to: "finish", entry: "right" };
  if (t === "SF") return { from: "start", to: "finish", entry: "right" };
  return { from: "finish", to: "start", entry: "left" };
}

/** Infer link type from the predecessor end you drag and the successor end you drop on. */
export function dependencyTypeFromAnchors(
  from: DependencyAnchor,
  to: DependencyAnchor
): DependencyType {
  if (from === "finish" && to === "start") return "FS";
  if (from === "start" && to === "start") return "SS";
  if (from === "finish" && to === "finish") return "FF";
  return "SF";
}

export type TaskDependency = {
  taskId:
    | string
    | {
        _id: string;
        title?: string;
        startDate?: string | null;
        dueDate?: string | null;
        status?: string;
      };
  type?: DependencyType;
  lagDays?: number;
};

export function dependencyPredecessorId(dep: TaskDependency): string | null {
  const raw = dep?.taskId;
  if (!raw) return null;
  if (typeof raw === "object" && raw._id) return String(raw._id);
  return String(raw);
}

export function toDateKey(value?: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "yyyy-MM-dd");
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd");
  }
  return null;
}

function parseDateKey(key: string) {
  return parseISO(`${key}T12:00:00`);
}

/**
 * Earliest allowed start for a Finish-to-Start link.
 * Day-granularity: successor may start the calendar day after predecessor
 * finishes, plus lagDays (negative lag = overlap / lead).
 */
export function earliestStartAfterFs(
  predecessorDueKey: string,
  lagDays = 0
): string {
  const lag = Number.isFinite(lagDays) ? Math.trunc(lagDays) : 0;
  return format(addDays(parseDateKey(predecessorDueKey), 1 + lag), "yyyy-MM-dd");
}

export type ScheduleConflict = {
  taskId: string;
  taskTitle: string;
  predecessorId: string;
  predecessorTitle: string;
  type: DependencyType;
  lagDays: number;
  requiredStart: string;
  actualStart: string;
  message: string;
};

type TaskLike = {
  _id: string;
  title: string;
  startDate?: string | null;
  dueDate?: string | null;
  dependencies?: TaskDependency[];
};

function shiftDateKey(key: string, days: number): string {
  const lag = Number.isFinite(days) ? Math.trunc(days) : 0;
  return format(addDays(parseDateKey(key), lag), "yyyy-MM-dd");
}

/**
 * Schedule constraints for every precedence type (day granularity).
 * FS: successor start is the day after predecessor finish (+ lag).
 * SS: successor start is on/after predecessor start (+ lag).
 * FF: successor finish is on/after predecessor finish (+ lag).
 * SF: successor finish is on/after predecessor start (+ lag).
 */
export function dependencyConstraint(
  type: DependencyType,
  predStart: string,
  predDue: string,
  lagDays = 0
): { field: "start" | "due"; required: string } | null {
  const lag = Number.isFinite(lagDays) ? Math.trunc(lagDays) : 0;
  if (type === "SS") {
    return { field: "start", required: shiftDateKey(predStart, lag) };
  }
  if (type === "FF") {
    return { field: "due", required: shiftDateKey(predDue, lag) };
  }
  if (type === "SF") {
    return { field: "due", required: shiftDateKey(predStart, lag) };
  }
  return { field: "start", required: earliestStartAfterFs(predDue, lag) };
}

export function findFsConflicts(
  tasks: TaskLike[],
  titleById?: Map<string, string>
): ScheduleConflict[] {
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  const conflicts: ScheduleConflict[] = [];

  for (const task of tasks) {
    const start = toDateKey(task.startDate);
    const due = toDateKey(task.dueDate);
    if (!start || !due) continue;
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];

    for (const dep of deps) {
      const rawType = String(dep.type || "FS").toUpperCase();
      const type: DependencyType = isDependencyType(rawType) ? rawType : "FS";

      const predId = dependencyPredecessorId(dep);
      if (!predId) continue;
      const pred = byId.get(predId);
      const predStart = toDateKey(pred?.startDate);
      const predDue = toDateKey(pred?.dueDate);
      if (!predStart || !predDue) continue;

      const lagDays = Number(dep.lagDays) || 0;
      const constraint = dependencyConstraint(type, predStart, predDue, lagDays);
      if (!constraint) continue;

      const actual = constraint.field === "start" ? start : due;
      if (actual >= constraint.required) continue;

      const predecessorTitle =
        titleById?.get(predId) ||
        pred?.title ||
        (typeof dep.taskId === "object" ? dep.taskId.title : null) ||
        "Predecessor";

      const fieldLabel = constraint.field === "start" ? "starts" : "finishes";
      conflicts.push({
        taskId: String(task._id),
        taskTitle: task.title,
        predecessorId: predId,
        predecessorTitle,
        type,
        lagDays,
        requiredStart: constraint.required,
        actualStart: actual,
        message: `"${task.title}" ${fieldLabel} ${actual} but ${type} from "${predecessorTitle}" requires ${constraint.required} or later`,
      });
    }
  }

  return conflicts;
}

/** Shift a date range by N calendar days (preserves inclusive duration). */
export function shiftDateRange(
  startKey: string,
  dueKey: string,
  deltaDays: number
): { startDate: string; dueDate: string } {
  return {
    startDate: format(addDays(parseDateKey(startKey), deltaDays), "yyyy-MM-dd"),
    dueDate: format(addDays(parseDateKey(dueKey), deltaDays), "yyyy-MM-dd"),
  };
}

export function resizeDateRange(
  startKey: string,
  dueKey: string,
  edge: "start" | "end",
  deltaDays: number
): { startDate: string; dueDate: string } {
  let start = parseDateKey(startKey);
  let due = parseDateKey(dueKey);
  if (edge === "start") {
    start = addDays(start, deltaDays);
    if (start > due) start = due;
  } else {
    due = addDays(due, deltaDays);
    if (due < start) due = start;
  }
  return {
    startDate: format(start, "yyyy-MM-dd"),
    dueDate: format(due, "yyyy-MM-dd"),
  };
}

export function calendarDaysBetween(startKey: string, dueKey: string): number {
  return differenceInCalendarDays(parseDateKey(dueKey), parseDateKey(startKey)) + 1;
}

export function serializeDependenciesForSave(
  deps: TaskDependency[]
): Array<{ taskId: string; type: DependencyType; lagDays: number }> {
  return deps
    .map((d) => {
      const taskId = dependencyPredecessorId(d);
      if (!taskId) return null;
      return {
        taskId,
        type: ((d.type || "FS").toUpperCase() as DependencyType) || "FS",
        lagDays: Number.isFinite(Number(d.lagDays)) ? Math.trunc(Number(d.lagDays)) : 0,
      };
    })
    .filter(Boolean) as Array<{
    taskId: string;
    type: DependencyType;
    lagDays: number;
  }>;
}

const DEPENDENCY_TYPES: DependencyType[] = ["FS", "SS", "FF", "SF"];

export type ParsedPredecessorToken = {
  row: number;
  type: DependencyType;
  lagDays: number;
  raw: string;
};

export type PredecessorParseResult =
  | { ok: true; tokens: ParsedPredecessorToken[] }
  | { ok: false; error: string };

/**
 * Parse editable predecessor text like "52", "52FS", "50FS,51FS", "50FS+1 51".
 * Row numbers are 1-based display indices in the current Gantt table order.
 */
export function parsePredecessorInput(input: string): PredecessorParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, tokens: [] };

  const parts = trimmed
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const tokens: ParsedPredecessorToken[] = [];
  const seenRows = new Set<number>();

  for (const part of parts) {
    const match = part.match(/^(\d+)(FS|SS|FF|SF)?([+-]\d+)?$/i);
    if (!match) {
      return {
        ok: false,
        error: `Invalid predecessor "${part}". Use row numbers like 12 or 12FS.`,
      };
    }
    const row = Number(match[1]);
    if (!Number.isInteger(row) || row < 1) {
      return { ok: false, error: `Invalid row number in "${part}".` };
    }
    if (seenRows.has(row)) {
      return { ok: false, error: `Duplicate predecessor row ${row}.` };
    }
    seenRows.add(row);

    const type = ((match[2] || "FS").toUpperCase() as DependencyType) || "FS";
    if (!DEPENDENCY_TYPES.includes(type)) {
      return { ok: false, error: `Invalid dependency type in "${part}".` };
    }

    let lagDays = 0;
    if (match[3]) {
      lagDays = Number(match[3]);
      if (!Number.isFinite(lagDays)) {
        return { ok: false, error: `Invalid lag in "${part}".` };
      }
      lagDays = Math.trunc(lagDays);
      if (lagDays < -365 || lagDays > 365) {
        return { ok: false, error: `Lag in "${part}" must be between -365 and 365.` };
      }
    }

    tokens.push({ row, type, lagDays, raw: part });
  }

  return { ok: true, tokens };
}

export function formatPredecessorCell(
  deps: TaskDependency[],
  rowByTaskId: Map<string, number>
): string {
  const parts: string[] = [];
  for (const dep of deps) {
    const predId = dependencyPredecessorId(dep);
    if (!predId) continue;
    const row = rowByTaskId.get(predId);
    if (row == null) continue;
    const type = ((dep.type || "FS").toUpperCase() as DependencyType) || "FS";
    const lag = Number(dep.lagDays) || 0;
    const lagPart = lag === 0 ? "" : lag > 0 ? `+${lag}` : `${lag}`;
    parts.push(`${row}${type}${lagPart}`);
  }
  return parts.join(", ");
}

/**
 * Detect cycles if `taskId` would depend on `dependencyTaskIds`.
 * Graph edge: successor -> predecessor (depends-on direction).
 */
export function wouldCreateCycle(
  taskId: string,
  dependencyTaskIds: string[],
  allTasks: Array<{ _id: string; dependencies?: TaskDependency[] }>
): boolean {
  const self = String(taskId);
  const deps = dependencyTaskIds.map(String);
  if (deps.includes(self)) return true;

  const adj = new Map<string, string[]>();
  for (const task of allTasks) {
    const id = String(task._id);
    const list = Array.isArray(task.dependencies) ? task.dependencies : [];
    adj.set(
      id,
      list.map((d) => dependencyPredecessorId(d)).filter(Boolean) as string[]
    );
  }
  adj.set(self, deps);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return dfs(self);
}

export type ResolvePredecessorsResult =
  | { ok: true; dependencies: Array<{ taskId: string; type: DependencyType; lagDays: number }> }
  | { ok: false; error: string };

/**
 * Resolve parsed row tokens into dependency payloads for a successor task.
 */
export function resolvePredecessorTokens(options: {
  tokens: ParsedPredecessorToken[];
  successorId: string;
  tasksInOrder: Array<{ _id: string; dependencies?: TaskDependency[] }>;
}): ResolvePredecessorsResult {
  const { tokens, successorId, tasksInOrder } = options;
  const dependencies: Array<{
    taskId: string;
    type: DependencyType;
    lagDays: number;
  }> = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const pred = tasksInOrder[token.row - 1];
    if (!pred) {
      return {
        ok: false,
        error: `No task at row ${token.row}. Valid rows are 1–${tasksInOrder.length}.`,
      };
    }
    const predId = String(pred._id);
    if (predId === String(successorId)) {
      return { ok: false, error: "A task cannot depend on itself." };
    }
    if (seen.has(predId)) {
      return { ok: false, error: `Duplicate predecessor row ${token.row}.` };
    }
    seen.add(predId);
    dependencies.push({
      taskId: predId,
      type: token.type,
      lagDays: token.lagDays,
    });
  }

  if (
    wouldCreateCycle(
      successorId,
      dependencies.map((d) => d.taskId),
      tasksInOrder
    )
  ) {
    return {
      ok: false,
      error: "This dependency would create a circular relationship.",
    };
  }

  return { ok: true, dependencies };
}

export type DependencyEdgeGeometry = {
  key: string;
  predecessorId: string;
  successorId: string;
  type?: DependencyType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conflict?: boolean;
  predecessorTitle?: string;
  /** Left-side entry (FS/SS) or right-side entry (FF/SF). */
  entry?: "left" | "right";
  /** Leave the predecessor start by stepping left before routing right (SF). */
  exitLeft?: boolean;
  /** Left edges of bars that a left trunk must stay clear of. */
  clearOfLeftXs?: number[];
  /** Right edges of bars that a right trunk must stay clear of. */
  clearOfRightXs?: number[];
};

/**
 * Orthogonal FS path via a left-side trunk:
 * pred finish → left to trunk → vertical → right into successor start.
 * The vertical never sits on/inside a successor bar.
 */
export function orthogonalDependencyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { laneOffset?: number; trunkX?: number }
): string {
  const stub = 16;
  const laneOffset = Math.max(0, opts?.laneOffset ?? 0);
  let trunkX =
    opts?.trunkX ?? Math.max(4, Math.min(x1, x2) - stub - laneOffset);

  // Trunk must stay strictly left of the successor entry point.
  trunkX = Math.min(trunkX, x2 - stub);
  trunkX = Math.max(4, trunkX);

  if (Math.abs(y1 - y2) < 0.5 && x2 >= x1 && trunkX >= x1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Always route the vertical on the left trunk — never drop from the
  // predecessor finish (that cuts through overlapping bars below/above).
  return `M ${x1} ${y1} L ${trunkX} ${y1} L ${trunkX} ${y2} L ${x2} ${y2}`;
}

/**
 * Orthogonal path that enters the successor finish from the right.
 * Used by FF (leave pred finish) and SF (leave pred start, then around).
 */
export function orthogonalRightEntryPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { trunkX?: number; exitLeft?: boolean }
): string {
  const stub = 16;
  let trunkX = opts?.trunkX ?? Math.max(x1, x2) + stub;
  trunkX = Math.max(trunkX, x2 + stub);
  trunkX = Math.max(4, trunkX);

  if (Math.abs(y1 - y2) < 0.5 && x2 >= x1 && trunkX <= x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  if (opts?.exitLeft) {
    const outX = Math.max(4, x1 - stub);
    return `M ${x1} ${y1} L ${outX} ${y1} L ${trunkX} ${y1} L ${trunkX} ${y2} L ${x2} ${y2}`;
  }

  return `M ${x1} ${y1} L ${trunkX} ${y1} L ${trunkX} ${y2} L ${x2} ${y2}`;
}

/**
 * Build trunk-and-branch connectors.
 * Left-entry links (FS, SS) share a trunk left of successor starts.
 * Right-entry links (FF, SF) share a trunk right of successor finishes.
 */
export function buildTrunkBranchDependencyPaths(
  edges: DependencyEdgeGeometry[],
  opts?: { trunkGap?: number; laneSpacing?: number }
): Array<DependencyEdgeGeometry & { d: string }> {
  const trunkGap = opts?.trunkGap ?? 28;
  const laneSpacing = opts?.laneSpacing ?? 10;

  const byGroup = new Map<string, DependencyEdgeGeometry[]>();
  for (const edge of edges) {
    const entry = edge.entry || "left";
    const type = edge.type || "FS";
    // Keep each precedence type on its own lane so an FF (purple) trunk
    // cannot paint over an SS (teal) link from the same predecessor.
    const groupKey = `${edge.predecessorId}:${type}:${entry}`;
    const list = byGroup.get(groupKey) || [];
    list.push(edge);
    byGroup.set(groupKey, list);
  }

  const groups = [...byGroup.entries()].sort((a, b) => {
    const aEntry = a[1][0].entry || "left";
    const bEntry = b[1][0].entry || "left";
    if (aEntry !== bEntry) return aEntry === "left" ? -1 : 1;
    const aMinX = Math.min(...a[1].map((e) => e.x2));
    const bMinX = Math.min(...b[1].map((e) => e.x2));
    if (aMinX !== bMinX) return aMinX - bMinX;
    return a[1][0].y1 - b[1][0].y1;
  });

  const results: Array<DependencyEdgeGeometry & { d: string }> = [];

  groups.forEach(([, group], laneIndex) => {
    const entry = group[0].entry || "left";
    let trunkX: number;

    if (entry === "right") {
      const maxSuccX = Math.max(...group.map((e) => e.x2));
      trunkX = maxSuccX + trunkGap;
      for (const edge of group) {
        trunkX = Math.max(trunkX, edge.x1 + trunkGap);
        for (const right of edge.clearOfRightXs || []) {
          trunkX = Math.max(trunkX, right + trunkGap);
        }
      }
      trunkX += (laneIndex % 6) * laneSpacing;
    } else {
      const minSuccX = Math.min(...group.map((e) => e.x2));
      trunkX = minSuccX - trunkGap;

      // Stay left of every bar the trunk would otherwise cross.
      for (const edge of group) {
        for (const left of edge.clearOfLeftXs || []) {
          trunkX = Math.min(trunkX, left - trunkGap);
        }
      }

      trunkX -= (laneIndex % 6) * laneSpacing;
      trunkX = Math.max(4, trunkX);
    }

    for (const edge of group) {
      const d =
        entry === "right"
          ? orthogonalRightEntryPath(edge.x1, edge.y1, edge.x2, edge.y2, {
              trunkX,
              exitLeft: edge.exitLeft,
            })
          : orthogonalDependencyPath(edge.x1, edge.y1, edge.x2, edge.y2, {
              trunkX,
            });
      results.push({
        ...edge,
        d,
      });
    }
  });

  return results;
}
