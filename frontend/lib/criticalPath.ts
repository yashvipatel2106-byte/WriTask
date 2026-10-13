import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  calendarDaysBetween,
  dependencyPredecessorId,
  isDependencyType,
  toDateKey,
  type DependencyType,
  type TaskDependency,
} from "./taskDependencies.ts";

export type CriticalPathTask = {
  _id: string;
  title?: string;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
  dependencies?: TaskDependency[];
};

export type CriticalPathMetrics = {
  earliestStart: string;
  earliestFinish: string;
  latestStart: string;
  latestFinish: string;
  totalFloat: number;
  durationDays: number;
};

export type CriticalPathResult = {
  criticalTaskIds: Set<string>;
  metricsByTaskId: Map<string, CriticalPathMetrics>;
  projectFinishDate: string | null;
};

type ScheduledNode = {
  id: string;
  start: string;
  due: string;
  durationDays: number;
};

function emptyResult(): CriticalPathResult {
  return {
    criticalTaskIds: new Set(),
    metricsByTaskId: new Map(),
    projectFinishDate: null,
  };
}

function parseKey(key: string) {
  return parseISO(`${key}T12:00:00`);
}

function shiftKey(key: string, days: number): string {
  const delta = Number.isFinite(days) ? Math.trunc(days) : 0;
  return format(addDays(parseKey(key), delta), "yyyy-MM-dd");
}

function laterDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function earlierDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseKey(to), parseKey(from));
}

function normalizeLag(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function linkType(dep: TaskDependency): DependencyType {
  const raw = String(dep.type || "FS").toUpperCase();
  return isDependencyType(raw) ? raw : "FS";
}

/**
 * Earliest start implied by one predecessor, using the same day rules as
 * dependencyConstraint / earliestStartAfterFs:
 * FS start >= pred finish + 1 + lag
 * SS start >= pred start + lag
 * FF finish >= pred finish + lag
 * SF finish >= pred start + lag
 */
function earliestStartFromPred(
  type: DependencyType,
  pred: { es: string; ef: string },
  durationDays: number,
  lagDays: number
): string {
  const span = Math.max(1, durationDays) - 1;
  if (type === "SS") return shiftKey(pred.es, lagDays);
  if (type === "FF") return shiftKey(pred.ef, lagDays - span);
  if (type === "SF") return shiftKey(pred.es, lagDays - span);
  return shiftKey(pred.ef, 1 + lagDays);
}

/** Latest finish allowed for a predecessor given a successor's late dates. */
function latestFinishFromSucc(
  type: DependencyType,
  succ: { ls: string; lf: string },
  predDurationDays: number,
  lagDays: number
): string {
  const span = Math.max(1, predDurationDays) - 1;
  if (type === "SS") return shiftKey(succ.ls, -lagDays + span);
  if (type === "FF") return shiftKey(succ.lf, -lagDays);
  if (type === "SF") return shiftKey(succ.lf, -lagDays + span);
  return shiftKey(succ.ls, -(1 + lagDays));
}

function topologicalOrder(
  ids: string[],
  successors: Map<string, string[]>
): { order: string[]; cyclic: Set<string> } {
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const id of ids) {
    for (const succ of successors.get(id) || []) {
      indegree.set(succ, (indegree.get(succ) || 0) + 1);
    }
  }

  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const succ of successors.get(id) || []) {
      const next = (indegree.get(succ) || 0) - 1;
      indegree.set(succ, next);
      if (next === 0) queue.push(succ);
    }
  }

  const placed = new Set(order);
  const cyclic = new Set(ids.filter((id) => !placed.has(id)));
  return { order, cyclic };
}

/**
 * Critical-path method for the Gantt schedule.
 * Uses inclusive calendar duration from each task's own start/due and the
 * same FS/SS/FF/SF lag rules as taskDependencies.ts. Does not mutate input.
 * Cyclic tasks are omitted rather than throwing.
 */
export function analyzeCriticalPath(
  tasks: CriticalPathTask[] | null | undefined
): CriticalPathResult {
  if (!Array.isArray(tasks) || tasks.length === 0) return emptyResult();

  const scheduled: ScheduledNode[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    if (!task || task._id == null) continue;
    const id = String(task._id);
    if (!id || seen.has(id)) continue;
    const start = toDateKey(task.startDate);
    const due = toDateKey(task.dueDate);
    if (!start || !due || due < start) continue;
    const durationDays = Math.max(1, calendarDaysBetween(start, due));
    seen.add(id);
    scheduled.push({ id, start, due, durationDays });
  }

  if (scheduled.length === 0) return emptyResult();

  const byId = new Map(scheduled.map((node) => [node.id, node]));
  const ids = scheduled.map((node) => node.id);

  const predLinks = new Map<
    string,
    Array<{ predId: string; type: DependencyType; lagDays: number }>
  >();
  const successors = new Map<string, string[]>();
  for (const id of ids) {
    predLinks.set(id, []);
    successors.set(id, []);
  }

  const scheduledIds = new Set(ids);
  for (const task of tasks) {
    if (!task || task._id == null) continue;
    const id = String(task._id);
    if (!scheduledIds.has(id)) continue;
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    for (const dep of deps) {
      const predId = dependencyPredecessorId(dep);
      if (!predId || predId === id || !scheduledIds.has(predId)) continue;
      const type = linkType(dep);
      const lagDays = normalizeLag(dep.lagDays);
      predLinks.get(id)?.push({ predId, type, lagDays });
      const list = successors.get(predId) || [];
      if (!list.includes(id)) {
        list.push(id);
        successors.set(predId, list);
      }
    }
  }

  const { order, cyclic } = topologicalOrder(ids, successors);
  if (order.length === 0) return emptyResult();

  const acyclic = new Set(order);
  const es = new Map<string, string>();
  const ef = new Map<string, string>();

  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    let earliest = node.start;
    for (const link of predLinks.get(id) || []) {
      if (!acyclic.has(link.predId) || cyclic.has(link.predId)) continue;
      const predEs = es.get(link.predId);
      const predEf = ef.get(link.predId);
      if (!predEs || !predEf) continue;
      earliest = laterDate(
        earliest,
        earliestStartFromPred(
          link.type,
          { es: predEs, ef: predEf },
          node.durationDays,
          link.lagDays
        )
      );
    }
    const finish = shiftKey(earliest, node.durationDays - 1);
    es.set(id, earliest);
    ef.set(id, finish);
  }

  let projectFinishDate: string | null = null;
  for (const id of order) {
    const finish = ef.get(id);
    if (!finish) continue;
    projectFinishDate = projectFinishDate
      ? laterDate(projectFinishDate, finish)
      : finish;
  }
  if (!projectFinishDate) return emptyResult();

  const ls = new Map<string, string>();
  const lf = new Map<string, string>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const node = byId.get(id);
    if (!node) continue;
    let latestFinish = projectFinishDate;
    for (const succId of successors.get(id) || []) {
      if (!acyclic.has(succId)) continue;
      const succLs = ls.get(succId);
      const succLf = lf.get(succId);
      if (!succLs || !succLf) continue;
      const succNode = byId.get(succId);
      if (!succNode) continue;
      for (const link of predLinks.get(succId) || []) {
        if (link.predId !== id) continue;
        latestFinish = earlierDate(
          latestFinish,
          latestFinishFromSucc(
            link.type,
            { ls: succLs, lf: succLf },
            node.durationDays,
            link.lagDays
          )
        );
      }
    }
    const latestStart = shiftKey(latestFinish, -(node.durationDays - 1));
    lf.set(id, latestFinish);
    ls.set(id, latestStart);
  }

  const metricsByTaskId = new Map<string, CriticalPathMetrics>();
  const criticalTaskIds = new Set<string>();

  for (const id of order) {
    const node = byId.get(id);
    const earliestStart = es.get(id);
    const earliestFinish = ef.get(id);
    const latestStart = ls.get(id);
    const latestFinish = lf.get(id);
    if (!node || !earliestStart || !earliestFinish || !latestStart || !latestFinish) {
      continue;
    }
    const totalFloat = daysBetween(earliestStart, latestStart);
    const metrics: CriticalPathMetrics = {
      earliestStart,
      earliestFinish,
      latestStart,
      latestFinish,
      totalFloat,
      durationDays: node.durationDays,
    };
    metricsByTaskId.set(id, metrics);
    if (totalFloat <= 0) criticalTaskIds.add(id);
  }

  return { criticalTaskIds, metricsByTaskId, projectFinishDate };
}

export function formatSlackLabel(totalFloat: number): string {
  if (!Number.isFinite(totalFloat)) return "Slack unavailable";
  if (totalFloat <= 0) return "Critical · 0d slack";
  if (totalFloat === 1) return "1d slack";
  return `${totalFloat}d slack`;
}
