"use client";
 
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useOrganization } from "@/components/context/organizationContext";
import Select from "@/components/ui/Select";
import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import {
  buildWorkloadDays,
  addDays,
  subDays,
  differenceInCalendarDays,
  isWeekendDay,
  isTodayDate,
  totalDaysBetween,
} from "@/lib/workloadDates";
import { parseISO } from "date-fns";
 
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { authFetch } from "@/lib/validation/authFetch";
import { appendWorkspaceScope, buildScopeQuery } from "@/lib/workspaceStorage";
import UserAvatar from "@/components/ui/UserAvatar";
import TaskDetailDialog from "@/components/projects/TaskDetailDialog";
import { buildStatusOptions } from "@/lib/taskStatuses";
import { toast } from "@/components/ui/toast";
import type { ProjectCustomField } from "@/lib/kanbanCardPreview";
import type { CardPreviewConfig } from "@/lib/kanbanCardPreview";
 
import {
  Loader2,
  Search,
  Download,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  FileType,
  Plus,
  Minus,
  Users,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  UserMinus,
} from "lucide-react";

const DEFAULT_HOURS_PER_DAY = 8;

function workloadHourBands(cap: number) {
  const hoursPerDay = cap > 0 ? cap : DEFAULT_HOURS_PER_DAY;
  const lowMax = Math.max(1, Math.floor(hoursPerDay * 0.375));
  const midMax = Math.max(lowMax + 1, Math.floor(hoursPerDay * 0.75));
  return { hoursPerDay, lowMax, midMax };
}

function workloadCellBand(hour: number, cap: number) {
  if (hour <= 0) return "empty";
  if (hour > cap) return "over";
  if (hour > cap * 0.75) return "near";
  if (hour > cap * 0.375) return "mid";
  return "low";
}

function resourceStatusTone(status?: string) {
  if (status === "Overallocated") return "text-red-600 dark:text-red-400";
  if (status === "Above target" || status === "High Load") return "text-orange-500";
  return "text-emerald-600 dark:text-emerald-400";
}
 
export default function WorkloadPage() {
 const { currentOrg, orgReady } = useOrganization();
const [selectedMember, setSelectedMember] = useState("yashvi");
const [showExportMenu, setShowExportMenu] = useState(false);
const [exporting, setExporting] = useState(false);

const [exportStatus, setExportStatus] = useState<
  "success" | "error" | null
>(null);

const [exportMessage, setExportMessage] = useState("");
const [search, setSearch] = useState("");
const [roleFilter, setRoleFilter] = useState("All");

const [roleOptions, setRoleOptions] = useState([]);
const [statusFilter, setStatusFilter] = useState("All");
const [selectedProject, setSelectedProject] = useState("All");
 
const [projects, setProjects] = useState<any[]>([]);
const [showHours, setShowHours] = useState(true);
const [showBacklog, setShowBacklog] = useState(false);
const [cellWidth, setCellWidth] = useState(80);
const [members, setMembers] = useState<any[]>([]);
const [averageCapacity, setAverageCapacity] = useState(0);
const [overCapacity, setOverCapacity] = useState(0);
const [underCapacity, setUnderCapacity] = useState(0);
const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY);
const [loading, setLoading] = useState(true);
const [expandedMembers, setExpandedMembers] = useState<string[]>([]);
const [resourceTab, setResourceTab] = useState<"timeline" | "availability" | "utilization">("timeline");
const [viewMode, setViewMode] = useState("Days");
const [selectedTask, setSelectedTask] = useState<any>(null);
const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);
const [taskDialogMeta, setTaskDialogMeta] = useState<{
  statusOptions: { value: string; label: string }[];
  customFields: ProjectCustomField[];
  otherCustomFields: ProjectCustomField[];
  cardPreviewConfig: CardPreviewConfig | null;
  adoptedCustomFieldIds: string[];
  organizationId: string | null;
  isPersonalProject: boolean;
} | null>(null);
 
 
 
// ✅ YE ALAAG HAI
const [showDatePicker, setShowDatePicker] = useState(false);

// "yyyy-MM-dd" — lets the user jump the (now-infinite) timeline to an
// arbitrary date instead of being limited to the preset ranges below.
const [jumpDateInput, setJumpDateInput] = useState("");

const [showViewMenu, setShowViewMenu] = useState(false);
const viewMenuRef = useRef<HTMLDivElement>(null);
const exportMenuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!showViewMenu && !showExportMenu) return;

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (showViewMenu && !viewMenuRef.current?.contains(target)) {
      setShowViewMenu(false);
    }
    if (showExportMenu && !exportMenuRef.current?.contains(target)) {
      setShowExportMenu(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [showViewMenu, showExportMenu]);

// ✅ YE ALAAG HAI
const [dateRange, setDateRange] = useState(() => {
 
  const today = new Date();
 
  const start = new Date(today);
  start.setDate(today.getDate() - 15);
 
  const end = new Date(today);
  end.setDate(today.getDate() + 15);
 
  return {
    start,
    end,
  };
});

/*
 * ── Infinite timeline scrolling ──────────────────────────────────────
 *
 * The visible `dateRange` window is deliberately kept bounded (never
 * more than TIMELINE_MAX_WINDOW_DAYS wide) rather than growing forever
 * — as the user scrolls near either edge we extend the range in that
 * direction by a chunk, and trim an equal chunk off the opposite end
 * once the window exceeds the cap. Trimming/prepending days shifts the
 * scroll container's content, so we compensate scrollLeft in a layout
 * effect (before paint) to keep whatever the user was looking at in
 * the same visual spot — no jump.
 */
const TIMELINE_CHUNK_DAYS = 30;
const TIMELINE_MAX_WINDOW_DAYS = 180;
const TIMELINE_EDGE_THRESHOLD_DAYS = 10;
const TIMELINE_JUMP_HALF_WINDOW_DAYS = 45;

/*
 * The member-info panel (avatar/name/role/Capacity/.../Status) is
 * rendered as a completely separate, non-scrolling column (w-[740px]
 * classes below) — not inside the horizontally-scrolling timeline at
 * all — so there is no `position: sticky` containing-block to worry
 * about. Both panels render their own copy of each row at matching
 * fixed heights (h-[72px] member rows, h-14 task rows) so they stay
 * vertically aligned.
 */

const timelineScrollRef = useRef<HTMLDivElement>(null);
const isExtendingRangeRef = useRef(false);
const pendingScrollAdjustRef = useRef(0);
const jumpTargetDateRef = useRef<Date | null>(null);
// Set right before calling setDateRange from one of the preset
// buttons (Today/Last 7 Days/.../Reset to Default) — without this,
// switching to a narrower or differently-positioned range left the
// scroll container at whatever scrollLeft the user had previously
// scrolled to, which could be completely out of bounds for the new
// range (the browser clamps it, so the view just looked broken/blank).
const resetScrollToStartRef = useRef(false);

const extendTimelineRange = useCallback(
  (direction: "past" | "future") => {
    if (isExtendingRangeRef.current) return;
    isExtendingRangeRef.current = true;

    /*
     * Deliberately NOT a functional setState updater — React (Strict
     * Mode, on by default in Next.js dev) invokes updater functions
     * twice to check for impurity, which would double-apply the
     * pendingScrollAdjustRef mutation below and cause a visible jump
     * right as the range extends. Reading `dateRange` from the
     * closure and passing a plain object instead keeps this a
     * one-shot side effect.
     */
    if (direction === "future") {
      const newEnd = addDays(dateRange.end, TIMELINE_CHUNK_DAYS);
      let newStart = dateRange.start;

      if (totalDaysBetween(newStart, newEnd) > TIMELINE_MAX_WINDOW_DAYS) {
        newStart = addDays(dateRange.start, TIMELINE_CHUNK_DAYS);
        // Days are being removed from the front — compensate so the
        // dates currently on screen don't shift left visually.
        pendingScrollAdjustRef.current -= TIMELINE_CHUNK_DAYS * cellWidth;
      }

      setDateRange({ start: newStart, end: newEnd });
      return;
    }

    const newStart = subDays(dateRange.start, TIMELINE_CHUNK_DAYS);
    // Days are being inserted before the current view — compensate
    // so the dates currently on screen don't shift right visually.
    pendingScrollAdjustRef.current += TIMELINE_CHUNK_DAYS * cellWidth;
    let newEnd = dateRange.end;

    if (totalDaysBetween(newStart, newEnd) > TIMELINE_MAX_WINDOW_DAYS) {
      newEnd = subDays(dateRange.end, TIMELINE_CHUNK_DAYS);
    }

    setDateRange({ start: newStart, end: newEnd });
  },
  [cellWidth, dateRange]
);

const handleTimelineScroll = useCallback(() => {
  const el = timelineScrollRef.current;
  if (!el || isExtendingRangeRef.current) return;

  const threshold = cellWidth * TIMELINE_EDGE_THRESHOLD_DAYS;

  if (el.scrollLeft < threshold) {
    extendTimelineRange("past");
  } else if (
    el.scrollLeft + el.clientWidth >
    el.scrollWidth - threshold
  ) {
    extendTimelineRange("future");
  }
}, [cellWidth, extendTimelineRange]);

/** Jumps the timeline to center on an arbitrary date (date picker). */
const jumpTimelineToDate = useCallback((target: Date) => {
  jumpTargetDateRef.current = target;
  setDateRange({
    start: subDays(target, TIMELINE_JUMP_HALF_WINDOW_DAYS),
    end: addDays(target, TIMELINE_JUMP_HALF_WINDOW_DAYS),
  });
}, []);

// Runs after the DOM reflects the new dateRange/days but before the
// browser paints — the right moment to adjust scrollLeft invisibly.
useLayoutEffect(() => {
  const el = timelineScrollRef.current;

  if (el && resetScrollToStartRef.current) {
    el.scrollLeft = 0;
    resetScrollToStartRef.current = false;
  } else if (el && jumpTargetDateRef.current) {
    const index = differenceInCalendarDays(
      jumpTargetDateRef.current,
      dateRange.start
    );
    el.scrollLeft = Math.max(
      0,
      index * cellWidth - el.clientWidth / 2 + cellWidth / 2
    );
    jumpTargetDateRef.current = null;
  } else if (el && pendingScrollAdjustRef.current !== 0) {
    el.scrollLeft += pendingScrollAdjustRef.current;
    pendingScrollAdjustRef.current = 0;
  }

  isExtendingRangeRef.current = false;
}, [dateRange, cellWidth]);
 
const fetchProjects = async () => {
  try {
    const query = buildScopeQuery(currentOrg?.organizationId || null);

    const res = await authFetch(`/projects${query}`);
    if (!res.ok) return;
 
    const data = await res.json();
 
    setProjects(
  data.filter(
    (p: any) =>
      !p.isDeleted &&
      p.status !== "archived"
  )
);
  } catch (err) {
    console.error(err);
  }
};
 
useEffect(() => {
  setSelectedProject("All");
  setMembers([]);
  setLoading(true);
}, [currentOrg?.organizationId]);

const fetchWorkload = useCallback(async () => {
  if (!orgReady) return;

  if (!currentOrg?.organizationId && selectedProject === "All") {
    setLoading(false);
    return;
  }

  try {
    const start = dateRange.start;
    const end = dateRange.end;
    const params = new URLSearchParams({
      role: roleFilter,
      status: statusFilter,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    if (currentOrg?.organizationId) {
      params.set("organizationId", currentOrg.organizationId);
    }
    appendWorkspaceScope(params);

    if (selectedProject !== "All") {
      const projectBelongsToOrg = projects.some(
        (project) => project._id === selectedProject
      );
      if (projectBelongsToOrg) {
        params.set("projectId", selectedProject);
      }
    }

    const res = await authFetch(
      `/dashboard/team-workload?${params.toString()}`
    );

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Backend Response:", errorData);
      throw new Error(`Failed to fetch workload (${res.status})`);
    }

    const data = await res.json();

    const formatted = data.members.map((m: any) => ({
      ...m,
      name: m.username,
      avatar: m.username?.charAt(0).toUpperCase() || "?",
      capacity: m.availableHours,
      availableWorkingDays: m.availableWorkingDays,
      scheduledWorkingDays: m.scheduledWorkingDays || 0,
      hoursPerDay:
        typeof m.hoursPerDay === "number" && m.hoursPerDay > 0
          ? m.hoursPerDay
          : DEFAULT_HOURS_PER_DAY,
      allocatedHours: m.allocatedHours,
      utilization: m.utilization,
      remainingCapacity: m.remainingCapacity,
      resourceStatus: m.resourceStatus || m.workloadStatus,
      utilizationTarget: m.utilizationTarget ?? 80,
      overallocated: Boolean(m.overallocated),
      dailyRows: Array.isArray(m.dailyRows) ? m.dailyRows : [],
      workload: m.workload,
      workloadOutside: Array.isArray(m.workloadOutside)
        ? m.workloadOutside
        : [],
      dailyCapacity: Array.isArray(m.dailyCapacity) ? m.dailyCapacity : [],
      completion: m.completion,
      assignedTasks: m.assignedTasks,
      completedTasks: m.completedTasks,
      tasks: m.tasks || [],
    }));

    setMembers(formatted);
    if (data.availableRoles) {
      setRoleOptions(
        data.availableRoles.map((role: string) => ({
          value: role,
          label: role.charAt(0).toUpperCase() + role.slice(1),
        }))
      );
    }
    setAverageCapacity(data.averageCapacity);
    setOverCapacity(data.overCapacity);
    setUnderCapacity(data.underCapacity);
    setHoursPerDay(
      typeof data.hoursPerDay === "number" && data.hoursPerDay > 0
        ? data.hoursPerDay
        : DEFAULT_HOURS_PER_DAY
    );
  } catch (err) {
    console.error("Workload Error:", err);
    setMembers([]);
  } finally {
    setLoading(false);
  }
}, [
  orgReady,
  currentOrg?.organizationId,
  selectedProject,
  dateRange,
  roleFilter,
  statusFilter,
  projects,
]);

const openWorkloadTask = useCallback(async (task: any) => {
  const projectId = String(task?.project?._id || task?.project || "");
  const taskId = String(task?._id || "");
  if (!projectId || !taskId) {
    toast.error("This task is missing project information.");
    return;
  }

  setOpeningTaskId(taskId);
  try {
    const [taskRes, projectRes] = await Promise.all([
      authFetch(`/projects/${projectId}/tasks/${taskId}`),
      authFetch(`/projects/${projectId}`),
    ]);

    if (!taskRes.ok) {
      const data = await taskRes.json().catch(() => ({}));
      toast.error(data.message || "Could not open task details.");
      return;
    }

    const fullTask = await taskRes.json();
    let statusOptions = buildStatusOptions();
    let customFields: ProjectCustomField[] = [];
    let otherCustomFields: ProjectCustomField[] = [];
    let cardPreviewConfig: CardPreviewConfig | null = null;
    let adoptedCustomFieldIds: string[] = [];
    let organizationId: string | null = null;
    let isPersonalProject = true;

    if (projectRes.ok) {
      const project = await projectRes.json();
      statusOptions = buildStatusOptions(project.customStatuses || []);
      customFields = Array.isArray(project.customFieldDefinitions)
        ? project.customFieldDefinitions
        : [];
      otherCustomFields = Array.isArray(project.otherWorkspaceCustomFields)
        ? project.otherWorkspaceCustomFields
        : [];
      cardPreviewConfig = project.cardPreviewConfig || null;
      adoptedCustomFieldIds = Array.isArray(project.adoptedCustomFieldIds)
        ? project.adoptedCustomFieldIds
        : [];
      organizationId =
        project.organization?._id || project.organization || null;
      isPersonalProject = !organizationId;
    }

    setTaskDialogMeta({
      statusOptions,
      customFields,
      otherCustomFields,
      cardPreviewConfig,
      adoptedCustomFieldIds,
      organizationId,
      isPersonalProject,
    });
    setSelectedTask({ ...fullTask, project: projectId });
  } catch {
    toast.error("Could not open task details.");
  } finally {
    setOpeningTaskId(null);
  }
}, []);

useEffect(() => {
  void fetchWorkload();
  void fetchProjects();

  const onWorkspaceChange = () => {
    void fetchWorkload();
    void fetchProjects();
  };
  const onTasksUpdated = () => {
    void fetchWorkload();
  };

  window.addEventListener("workspace-changed", onWorkspaceChange);
  window.addEventListener("tasks-updated", onTasksUpdated);
  return () => {
    window.removeEventListener("workspace-changed", onWorkspaceChange);
    window.removeEventListener("tasks-updated", onTasksUpdated);
  };
}, [fetchWorkload]);
const days = useMemo(
  () => buildWorkloadDays(dateRange.start, dateRange.end),
  [dateRange]
);

const toggleMember = (id: string) => {
  setExpandedMembers((prev) => {
    if (prev.includes(id)) {
      return prev.filter((item) => item !== id);
    }

    return [...prev, id];
  });
};

const today = new Date();
today.setHours(0, 0, 0, 0);

const todayIndex = days.findIndex((d) => {
  const current = new Date(d.fullDate);
  current.setHours(0, 0, 0, 0);

  return current.getTime() === today.getTime();
});


const getWorkingDayIndex = (date: Date) => {
  let index = 0;

  const current = new Date(dateRange.start);
  current.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  while (current < target) {
    if (!isWeekendDay(current)) {
      index++;
    }

    current.setDate(current.getDate() + 1);
  }

  return index;
};

const getWorkingDaysBetween = (
  start: Date,
  end: Date
) => {
  let days = 0;

  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (current <= last) {
    if (!isWeekendDay(current)) {
      days++;
    }

    current.setDate(current.getDate() + 1);
  }

  return Math.max(days, 1);
};



 
const exportCSV = async () => {
  try {
    setExporting(true);

    await new Promise((resolve) =>
      setTimeout(resolve, 1200)
    );

    
    
    const metadata = [
  "TEAM WORKLOAD REPORT",
  "",
  `Organization,${currentOrg?.name || "Personal Workspace"}`,
  `Generated On,${new Date().toLocaleString()}`,
  "Report Type,Team Workload",
  "",
].join("\n");

    

     const summary = [
  "Metric,Value",

  `Total Members,${workloadAnalytics.totalMembers}`,

  `Total Tasks,${workloadAnalytics.totalTasks}`,

  `Completed Tasks,${workloadAnalytics.totalCompleted}`,

  `Average Capacity,${averageCapacity}%`,

  `Over Capacity Members,${overCapacity}`,

  `Under Capacity Members,${underCapacity}`,

  `Top Performer,${workloadAnalytics.topPerformer.name}`,

  `Most Loaded,${workloadAnalytics.mostLoaded.name}`,

  `Highest Utilization,${workloadAnalytics.highestUtilization.name}`,

  `Lowest Utilization,${workloadAnalytics.lowestUtilization.name}`,
].join("\n");

   const csv =
  "\uFEFF" +
  metadata +
  summary;

   const blob = new Blob([csv], {
  type: "text/csv;charset=utf-8;header=present",
});

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    const today = new Date()
  .toISOString()
  .split("T")[0];

link.download = `team-workload-${today}.csv`;

    link.click();

    URL.revokeObjectURL(url);

    setExportStatus("success");
    setExportMessage(
      "CSV exported successfully."
    );
  } catch {
    setExportStatus("error");
    setExportMessage(
      "CSV export failed."
    );
  } finally {
    setExporting(false);

    setTimeout(() => {
      setExportStatus(null);
    }, 3000);
  }
};
 
 
 
const exportExcel = async () => {
  try {
    setExporting(true);

    const workbook = new ExcelJS.Workbook();

workbook.creator = "WriTask";
workbook.company = "WriTask";
workbook.subject = "Team Workload";
workbook.title = "Team Workload Report";
workbook.created = new Date();

const summarySheet = workbook.addWorksheet("Summary");


// ======================================================
// SUMMARY SHEET
// ======================================================

// Report Title
summarySheet.mergeCells("A1:D1");

const titleCell = summarySheet.getCell("A1");

titleCell.value = "TEAM WORKLOAD REPORT";

titleCell.font = {
  size: 20,
  bold: true,
  color: {
    argb: "FFFFFF",
  },
};

titleCell.alignment = {
  horizontal: "center",
  vertical: "middle",
};

titleCell.fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: {
    argb: "0891B2",
  },
};

summarySheet.getRow(1).height = 30;

// Empty Row
summarySheet.addRow([]);

// Organization
summarySheet.addRow([
  "Organization",
  currentOrg?.name || "Personal Workspace",
]);

summarySheet.addRow([
  "Generated On",
  new Date().toLocaleString(),
]);

summarySheet.addRow([
  "Report Type",
  "Team Workload",
]);

summarySheet.addRow([]);

// KPI Heading
const headingRow = summarySheet.addRow([
  "Metric",
  "Value",
]);

headingRow.font = {
  bold: true,
};

headingRow.fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: {
    argb: "D9F2F8",
  },
};

// KPI Rows
summarySheet.addRow([
  "Total Members",
  workloadAnalytics.totalMembers,
]);

summarySheet.addRow([
  "Total Tasks",
  workloadAnalytics.totalTasks,
]);

summarySheet.addRow([
  "Completed Tasks",
  workloadAnalytics.totalCompleted,
]);

summarySheet.addRow([
  "Average Capacity",
  `${averageCapacity}%`,
]);

summarySheet.addRow([
  "Over Capacity Members",
  overCapacity,
]);

summarySheet.addRow([
  "Under Capacity Members",
  underCapacity,
]);

summarySheet.addRow([
  "Top Performer",
  workloadAnalytics.topPerformer.name,
]);

summarySheet.addRow([
  "Most Loaded",
  workloadAnalytics.mostLoaded.name,
]);

summarySheet.addRow([
  "Highest Utilization",
  workloadAnalytics.highestUtilization.name,
]);

summarySheet.addRow([
  "Lowest Utilization",
  workloadAnalytics.lowestUtilization.name,
]);

// Column Width
summarySheet.columns = [
  {
    width: 35,
  },
  {
    width: 35,
  },
  {
    width: 20,
  },
  {
    width: 20,
  },
];

// Border + Alignment
summarySheet.eachRow((row) => {

  row.eachCell((cell) => {

    cell.border = {
      top: {
        style: "thin",
      },
      left: {
        style: "thin",
      },
      bottom: {
        style: "thin",
      },
      right: {
        style: "thin",
      },
    };

    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
    };

  });

});

const today = new Date()
  .toISOString()
  .split("T")[0];

const buffer = await workbook.xlsx.writeBuffer();

const blob = new Blob([buffer], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

const url = window.URL.createObjectURL(blob);

const link = document.createElement("a");

link.href = url;
link.download = `team-workload-${today}.xlsx`;

document.body.appendChild(link);

link.click();

document.body.removeChild(link);

window.URL.revokeObjectURL(url);
    

    setExportStatus("success");
    setExportMessage(
      "Excel exported successfully."
    );

  } catch {

    setExportStatus("error");
    setExportMessage(
      "Excel export failed."
    );

  } finally {

    setExporting(false);

    setTimeout(() => {
      setExportStatus(null);
    }, 3000);

  }
};

const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject("Canvas not supported");
        return;
      }

      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = reject;

    img.src = src;
  });
};
 
 
const exportPDF = async () => {
 
  const doc = new jsPDF();
  const logoBase64 = await loadImageAsBase64("/logo (1).png");

  doc.setProperties({
  title: "Team Workload Report",
  subject: "Team Workload",
  author: "WriTask",
  creator: "WriTask",
  keywords: "Workload, Tasks, Team",
});

  // Header Background
doc.setFillColor(248, 250, 252);
doc.rect(0, 0, 210, 52, "F");

// Cyan Bottom Border
doc.setDrawColor(6, 182, 212);
doc.setLineWidth(1.2);
doc.setLineWidth(0.5);
doc.line(14, 42, 196, 42);

// ===== Logo =====

// We will replace this with the real logo in the next step
// ================= Left Header =================

// Logo
doc.addImage(
  logoBase64,
  "PNG",
  12,
  9,
  18,
  18
);

// WriTask
doc.setFont("helvetica", "bold");
doc.setFontSize(20);
doc.setTextColor(17, 24, 39);

doc.text("WriTask", 34, 18);

// Report Title
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.setTextColor(100);

doc.text(
  "Team Workload Report",
  34,
  25
);

// Workspace Badge

doc.setFillColor(224, 247, 250);

doc.roundedRect(
  34,
  32,
  34,
  8,
  4,
  4,
  "F"
);

doc.roundedRect(
  34,
  32,
  34,
  8,
  4,
  4,
  "S"
);

doc.text(
  (currentOrg?.name || "Workspace").toUpperCase(),
  51,
  37,
  {
    align: "center",
  }
);
// ================= Right Header =================

const reportRange = `${dateRange.start.toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
})} - ${dateRange.end.toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})}`;

const generatedOn = new Date().toLocaleString("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(6, 182, 212);

doc.text(reportRange, 190, 18, {
  align: "right",
});

doc.setFont("helvetica", "normal");
doc.setFontSize(9);
doc.setTextColor(100);

doc.text(`Generated ${generatedOn}`, 190, 25, {
  align: "right",
});

 
 
  /*doc.setFontSize(11);

doc.setFont("helvetica", "bold");

doc.text(
  `Organization : ${
    currentOrg?.name || "Personal Workspace"
  }`,
  14,
  42
);

doc.text(
  `Project : ${
    selectedProject === "All"
      ? "All Projects"
      : selectedProject
  }`,
  14,
  50
);

doc.text(
  `Role : ${roleFilter}`,
  14,
  58
);

doc.text(
  `Generated : ${new Date().toLocaleString()}`,
  14,
  66
);*/

const completionRate =
  workloadAnalytics.totalTasks === 0
    ? 0
    : Math.round(
        (workloadAnalytics.totalCompleted /
          workloadAnalytics.totalTasks) *
          100
      );

const performanceScore = Math.min(
  100,
  Math.round(
    completionRate * 0.6 +
      averageCapacity * 0.4
  )
);

const healthyMembers = exportMembers.filter(
  (m) => m.utilization < 80
).length;

const nearCapacityMembers =
  exportMembers.filter(
    (m) =>
      m.utilization >= 80 &&
      m.utilization <= 100
  ).length;

const overloadedMembers =
  exportMembers.filter(
    (m) => m.utilization > 100
  ).length;

/*doc.setFillColor(245, 245, 245);

doc.roundedRect(126, 38, 70, 54, 3, 3, "F");

doc.setFontSize(11);
doc.setFont("helvetica", "bold");
doc.setTextColor(40);

doc.text("EXECUTIVE SUMMARY", 130, 46);

doc.setFontSize(9);
doc.setFont("helvetica", "normal");

doc.text(
  `Members : ${workloadAnalytics.totalMembers}`,
  130,
  54
);

doc.text(
  `Tasks : ${workloadAnalytics.totalTasks}`,
  130,
  61
);

doc.text(
  `Completed : ${workloadAnalytics.totalCompleted}`,
  130,
  68
);

doc.text(
  `Completion : ${completionRate}%`,
  130,
  75
);

doc.text(
  `Performance : ${performanceScore}/100`,
  130,
  82
);

doc.text(
  `Avg Capacity : ${averageCapacity}%`,
  130,
  89
);*/

// ================= KPI CARDS =================

const cardWidth = 28;
const cardHeight = 18;
const gap = 3;

const cardY = 52;

const cards = [
  {
    title: "Members",
    value: `${workloadAnalytics.totalMembers}`,
  },
  {
    title: "Tasks",
    value: `${workloadAnalytics.totalTasks}`,
  },
  {
    title: "Completed",
    value: `${workloadAnalytics.totalCompleted}`,
  },
  {
    title: "Pending",
    value: `${workloadAnalytics.totalTasks - workloadAnalytics.totalCompleted}`,
  },
  {
    title: "Capacity",
    value: `${averageCapacity}%`,
  },
  {
    title: "Completion",
    value: `${completionRate}%`,
  },
];

cards.forEach((card, index) => {

  const x = 14 + index * (cardWidth + gap);

  doc.setFillColor(255,255,255);

  doc.roundedRect(
    x,
    cardY,
    cardWidth,
    cardHeight,
    3,
    3,
    "F"
  );

  doc.setDrawColor(225);

  doc.roundedRect(
    x,
    cardY,
    cardWidth,
    cardHeight,
    3,
    3,
    "S"
  );

  doc.setFont("helvetica","bold");

  doc.setFontSize(13);

  doc.setTextColor(15,23,42);

  doc.text(
    card.value,
    x+4,
    cardY+8
  );

  doc.setFontSize(7);

  doc.setFont("helvetica","normal");

  doc.setTextColor(120);

  doc.text(
    card.title.toUpperCase(),
    x+4,
    cardY+14
  );

});

  autoTable(doc, {

 
    head: [[
      "Name",
      "Role",
      "Assigned",
      "Completed",
      "Capacity",
      "Completion",
    ]],
 
   body: exportMembers.map((m) => [
      m.name,
      m.role,
      m.assignedTasks,
      m.completedTasks,
      `${m.capacity}h`,
      `${m.completion}%`,
    ]),
    showHead: "everyPage",
    tableLineColor: [226,232,240],
tableLineWidth: 0.2,
    theme: "striped",

headStyles: {
  fillColor: [14,116,144],
  textColor: 255,
  fontStyle: "bold",
  fontSize: 10,
  halign: "center",
  valign: "middle",
  cellPadding: 6,
},

bodyStyles: {
  textColor: [55,65,81],
  fontSize: 9,
  cellPadding: 6,
  valign: "middle",
},

alternateRowStyles: {
  fillColor: [248,250,252],
},

styles: {
  lineColor: [229,231,235],
  lineWidth: 0.2,
},

columnStyles: {
  0: { halign: "left" },
  1: { halign: "center" },
  2: { halign: "center" },
  3: { halign: "center" },
  4: { halign: "center" },
  5: { halign: "center" },
},

margin: {
  left: 14,
  right: 14,
},
 
    startY: 88,
    didDrawPage: () => {
  doc.setDrawColor(226,232,240);
},
 
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  let currentY = finalY + 15;

  const pageHeight = doc.internal.pageSize.getHeight();

const checkPageBreak = (requiredHeight: number) => {
  if (currentY + requiredHeight > pageHeight - 20) {
    doc.addPage();
    currentY = 20;
  }
};
currentY = finalY + 12;

checkPageBreak(35);
doc.setFillColor(248,250,252);

doc.roundedRect(
  14,
  currentY,
  182,
  22,
  4,
  4,
  "F"
);

doc.setFont("helvetica", "bold");
doc.setFontSize(12);

doc.text(
"TEAM PERFORMANCE",
18,
currentY + 8
);

doc.setFontSize(10);
doc.setFont("helvetica", "normal");

doc.text(
  `Performance Score : ${performanceScore}/100`,
  18,
  currentY + 16
);

const performanceLabel =
  performanceScore >= 90
    ? "Excellent"
    : performanceScore >= 75
    ? "Good"
    : performanceScore >= 50
    ? "Average"
    : "Needs Attention";

doc.text(
  `Status : ${performanceLabel}`,
  120,
  currentY + 16
);
currentY += 34;

  // ================= WORKLOAD INSIGHTS =================

checkPageBreak(70);
doc.setFont("helvetica", "bold");
doc.setFontSize(14);
doc.setTextColor(31,41,55);

doc.text(
  "WORKLOAD INSIGHTS",
  14,
  currentY
);

currentY += 8;

const insightCards = [
  {
    title: "Top Performer",
    value: workloadAnalytics.topPerformer.name,
  },
  {
    title: "Most Loaded",
    value: workloadAnalytics.mostLoaded.name,
  },
  {
    title: "Highest Utilization",
    value: workloadAnalytics.highestUtilization.name,
  },
  {
    title: "Lowest Utilization",
    value: workloadAnalytics.lowestUtilization.name,
  },
];

insightCards.forEach((card, index) => {

  const x =
    index % 2 === 0
      ? 14
      : 108;

  const y =
    currentY +
    Math.floor(index / 2) * 24;

  doc.setFillColor(255,255,255);

  doc.roundedRect(
    x,
    y,
    88,
    18,
    3,
    3,
    "F"
  );

  doc.setDrawColor(225);

  doc.roundedRect(
    x,
    y,
    88,
    18,
    3,
    3,
    "S"
  );

  doc.setFontSize(8);

  doc.setFont(
    "helvetica",
    "normal"
  );

  doc.setTextColor(120);

  doc.text(
    card.title.toUpperCase(),
    x + 4,
    y + 6
  );

  doc.setFontSize(11);

  doc.setFont(
    "helvetica",
    "bold"
  );

  doc.setTextColor(15,23,42);

  doc.text(
    card.value,
    x + 4,
    y + 13
  );

});

currentY += 54;

// ================= CAPACITY HEALTH =================

doc.setFont("helvetica","bold");
doc.setFontSize(14);
doc.setTextColor(31,41,55);

checkPageBreak(45);
doc.text(
  "WORKLOAD CAPACITY",
  14,
  currentY
);

currentY += 8;

const capacityCards = [
  {
    title: "Available",
    value: healthyMembers,
    color: [34,197,94],
  },
  {
    title: "Near Capacity",
    value: nearCapacityMembers,
    color: [245,158,11],
  },
  {
    title: "Over Capacity",
    value: overloadedMembers,
    color: [239,68,68],
  },
];
capacityCards.forEach((card,index)=>{

const x = 14 + index*61;

doc.setFillColor(255,255,255);

doc.roundedRect(
x,
currentY,
56,
24,
3,
3,
"F"
);

doc.setDrawColor(225);

doc.roundedRect(
x,
currentY,
56,
24,
3,
3,
"S"
);

doc.setFillColor(
card.color[0],
card.color[1],
card.color[2]
);

doc.circle(
x+8,
currentY+8,
2.5,
"F"
);

doc.setFontSize(8);

doc.setTextColor(120);

doc.setFont("helvetica","normal");

doc.text(
card.title.toUpperCase(),
x+14,
currentY+7
);

doc.setFontSize(14);

doc.setTextColor(
card.color[0],
card.color[1],
card.color[2]
);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
String(card.value),
x+14,
currentY+17
);

});

currentY += 40;

// ================= MANAGEMENT RECOMMENDATIONS =================

checkPageBreak(70);
doc.setFont("helvetica","bold");
doc.setFontSize(14);
doc.setTextColor(31,41,55);

checkPageBreak(60);
doc.text(
  "MANAGEMENT RECOMMENDATIONS",
  14,
  currentY
);

currentY += 8;

doc.setFillColor(248,250,252);

doc.roundedRect(
  14,
  currentY,
  182,
  40,
  4,
  4,
  "F"
);

doc.setDrawColor(226,232,240);

doc.roundedRect(
  14,
  currentY,
  182,
  40,
  4,
  4,
  "S"
);

const recommendations: string[] = [];

if (overloadedMembers > 0) {
  recommendations.push(
    `• Redistribute tasks from ${workloadAnalytics.mostLoaded.name} to reduce workload imbalance.`
  );
}

if (healthyMembers > 0) {
  recommendations.push(
    `• Utilize ${healthyMembers} available team member(s) for upcoming work.`
  );
}

if (completionRate >= 80) {
  recommendations.push(
    "• Team completion rate is excellent. Maintain the current workflow."
  );
} else if (completionRate >= 50) {
  recommendations.push(
    "• Team performance is stable. Monitor pending tasks regularly."
  );
} else {
  recommendations.push(
    "• Completion rate is low. Review priorities and remove blockers."
  );
}

if (averageCapacity > 90) {
  recommendations.push(
    "• Team capacity is critically high. Consider increasing resources."
  );
}

doc.setFontSize(10);

doc.setFont(
  "helvetica",
  "normal"
);

doc.setTextColor(55,65,81);

recommendations.forEach((item,index)=>{

doc.text(

`• ${item.replace(/^•\s*/, "")}`,

20,

currentY+10+(index*8),

{
maxWidth:170
}

);

});


 




 
 const today = new Date()
  .toISOString()
  .split("T")[0];



  const totalPages = doc.getNumberOfPages();

for (let i = 1; i <= totalPages; i++) {

  doc.setPage(i);

  doc.setFontSize(9);

  doc.setTextColor(100);

  doc.text(
    `Page ${i} of ${totalPages}`,
    168,
    pageHeight - 5
  );
}

doc.save(
  `team-workload-${today}.pdf`
);

};

 
const filteredMembers = members.filter((member) => {
 
 
  const searchMatch =
    member.name.toLowerCase().includes(search.toLowerCase()) ||
    member.role.toLowerCase().includes(search.toLowerCase());
 
  const roleMatch =
    roleFilter === "All" ||
    member.role === roleFilter;
 
  return searchMatch && roleMatch;
 
});
const visibleMembers = showBacklog
  ? filteredMembers
  : filteredMembers.filter(
      (member) => member.assignedTasks > 0
    );

    const exportMembers = visibleMembers.filter((member) => {
  const searchMatch =
    member.name.toLowerCase().includes(search.toLowerCase()) ||
    member.role.toLowerCase().includes(search.toLowerCase());

  const roleMatch =
    roleFilter === "All" ||
    member.role === roleFilter;

  return searchMatch && roleMatch;
});

const workloadAnalytics = {
  totalMembers: exportMembers.length,

  totalTasks: exportMembers.reduce(
    (sum, member) => sum + member.assignedTasks,
    0
  ),

  totalCompleted: exportMembers.reduce(
    (sum, member) => sum + member.completedTasks,
    0
  ),

  topPerformer: exportMembers.reduce(
    (best, member) =>
      member.completedTasks > best.completedTasks
        ? member
        : best,
    exportMembers[0]
  ),

  mostLoaded: exportMembers.reduce(
    (best, member) =>
      member.assignedTasks > best.assignedTasks
        ? member
        : best,
    exportMembers[0]
  ),

  highestUtilization: exportMembers.reduce(
    (best, member) =>
      member.utilization > best.utilization
        ? member
        : best,
    exportMembers[0]
  ),

  lowestUtilization: exportMembers.reduce(
    (best, member) =>
      member.utilization < best.utilization
        ? member
        : best,
    exportMembers[0]
  ),
};

const hourBands = workloadHourBands(hoursPerDay);
 
  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
 
      <div className="flex h-full">
 
        <Sidebar />
 
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-3 sm:p-6 dark:bg-[#0B1120] dark:text-slate-100">
 
          {/* Header */}
 
          <div className="flex justify-between items-start">
 
            <div>
 
              <h1 className="text-4xl font-bold text-slate-900 tracking-tight dark:text-slate-100">
  Team Workload
</h1>
 
              <p className="text-slate-500 mt-2 dark:text-slate-400">
                Monitor team capacity, task allocation and workload distribution in real-time.
              </p>
 
            </div>
 
           <div className="flex gap-4">
 
<div className="relative" ref={exportMenuRef}>

  <button
  onClick={() => setShowExportMenu(!showExportMenu)}
  className="
flex items-center gap-3
px-5 py-3
rounded-xl
bg-white
border border-slate-200
shadow-sm
hover:bg-slate-50
hover:shadow-md
transition-all
duration-200
dark:bg-slate-900
dark:border-slate-800
dark:hover:bg-slate-800
"
>
  {exporting ? (
  <Loader2
    size={18}
    className="animate-spin"
  />
) : (
  <Download size={18} />
)}

  <span className="font-medium">
    Export
  </span>

  {showExportMenu ? (
    <ChevronUp size={16} />
  ) : (
    <ChevronDown size={16} />
  )}
</button>
 
  {showExportMenu && (
    <div
  className="
  absolute
  right-0
  mt-3
  flex
  items-center
  gap-2
  rounded-2xl
  border
  border-slate-200
  bg-white
  shadow-2xl
  p-2
  z-50
  dark:bg-slate-900
  dark:border-slate-800
"
>
 
      <button
  disabled={exporting}
  onClick={() => {
    exportCSV();
    setShowExportMenu(false);
  }}
  className="flex items-center gap-2 rounded-xl px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
>
  <FileText size={18} className="text-blue-500" />
  <span className="font-medium text-sm">CSV</span>
</button>
 
      <button
  disabled={exporting}
  onClick={() => {
    exportExcel();
    setShowExportMenu(false);
  }}
  className="flex items-center gap-2 rounded-xl px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
>
  <FileSpreadsheet size={18} className="text-green-600" />
  <span className="font-medium text-sm">Excel</span>
</button>
 
    <button
  disabled={exporting}
  onClick={() => {
    exportPDF();
    setShowExportMenu(false);
  }}
  className="flex items-center gap-2 rounded-xl px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
>
  <FileType size={18} className="text-red-500" />
  <span className="font-medium text-sm">PDF</span>
</button>
 
    </div>
  )}
 
</div>
 
<div className="relative" ref={viewMenuRef}>
  <button
  onClick={() => setShowViewMenu(!showViewMenu)}
    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800"
  >
    <Calendar size={18} />
 
    {dateRange.start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}
 
    {" - "}
 
    {dateRange.end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}
  </button>
  {showViewMenu && (
  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 z-50 dark:border-slate-800 dark:bg-slate-900">

    <button
      className="w-full px-3 py-2.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={() => {
        // A literal single-day range left the grid with one column and
        // nothing to scroll. Jump to (and center on) today instead, so
        // today is actually visible rather than scrolled off-screen.
        jumpTimelineToDate(new Date());
        setShowViewMenu(false)
      }}
    >
      Today
    </button>

    <button
      className="w-full px-3 py-2.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);

        resetScrollToStartRef.current = true;
        setDateRange({
          start,
          end,
        });

       setShowViewMenu(false);
      }}
    >
      Last 7 Days
    </button>

    <button
      className="w-full px-3 py-2.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);

        resetScrollToStartRef.current = true;
        setDateRange({
          start,
          end,
        });

        setShowViewMenu(false);
      }}
    >
      Last 30 Days
    </button>

    <button
      className="w-full px-3 py-2.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={() => {
        const today = new Date();

        const first = new Date(
          today.getFullYear(),
          today.getMonth(),
          1
        );

        resetScrollToStartRef.current = true;
        setDateRange({
          start: first,
          end: today,
        });

        setShowViewMenu(false);
      }}
    >
      This Month
    </button>

    <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

    <div className="px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        Jump to date
      </p>
      <ThemedDatePicker
        value={jumpDateInput}
        onChange={(value) => {
          setJumpDateInput(value);
          if (!value) return;
          jumpTimelineToDate(parseISO(value));
          setShowViewMenu(false);
        }}
        placeholder="Any date"
      />
    </div>

    <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

    <button
      className="w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-cyan-700 hover:bg-cyan-50 transition-colors dark:text-cyan-400 dark:hover:bg-cyan-500/10"
      onClick={() => {
        const today = new Date();

        const start = new Date(today);
        start.setDate(today.getDate() - 15);

        const end = new Date(today);
        end.setDate(today.getDate() + 15);

        // Center on today rather than just resetting scrollLeft to 0 —
        // otherwise today (15 days into the range) could land off-screen.
        jumpTargetDateRef.current = today;
        setDateRange({
          start,
          end,
        });

        setShowViewMenu(false);
      }}
    >
      Reset to Default
    </button>

  </div>
)}

</div>  
</div>
</div>  
 
          {/* Summary Cards */}
 
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mt-8">
 
            <div className="dashboard-card min-h-[110px]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Members</p>
                  <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">{members.length}</h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0 dark:bg-purple-500/10">
                  <Users className="text-purple-600 dark:text-purple-400" size={28} />
                </div>
              </div>
            </div>
 
            <div className="dashboard-card min-h-[110px]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Tasks</p>
                  <h2 className="text-4xl font-bold text-slate-900 mt-1 dark:text-slate-100">
                    {members.reduce((t, m) => t + m.assignedTasks, 0)}
                  </h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0 dark:bg-blue-500/10">
                  <ClipboardList className="text-blue-600 dark:text-blue-400" size={28} />
                </div>
              </div>
            </div>
 
            <div className="dashboard-card min-h-[110px]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Average Capacity</p>
                  <h2 className="text-4xl font-bold text-green-600 mt-1 dark:text-green-400">{averageCapacity}%</h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center shrink-0 dark:bg-green-500/10">
                  <TrendingUp className="text-green-600 dark:text-green-400" size={28} />
                </div>
              </div>
            </div>
 
            <div className="dashboard-card border-red-200 min-h-[110px] dark:border-red-500/30">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Over Capacity</p>
                  <h2 className="text-4xl font-bold text-red-600 mt-1 dark:text-red-400">{overCapacity}</h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center shrink-0 dark:bg-red-500/10">
                  <AlertTriangle className="text-red-600 dark:text-red-400" size={28} />
                </div>
              </div>
            </div>
 
            <div className="dashboard-card border-yellow-200 min-h-[110px] dark:border-yellow-500/30">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Under Capacity</p>
                  <h2 className="text-4xl font-bold text-yellow-600 mt-1 dark:text-yellow-400">{underCapacity}</h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-yellow-100 flex items-center justify-center shrink-0 dark:bg-yellow-500/10">
                  <UserMinus className="text-yellow-600 dark:text-yellow-400" size={28} />
                </div>
              </div>
            </div>
 
          </div>
 
          {/* ================= FILTER BAR ================= */}
 
<div className="mt-8 rounded-t-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
 
  <div className="flex flex-wrap items-center justify-between p-3 sm:p-5 gap-3 sm:gap-4">

    {/* LEFT */}

    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
 
      {/* Search */}
 
      <div className="relative">
 
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
 
        <input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search members..."
          className="w-full sm:w-[220px] bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500"
        />
 
      </div>
 
     <Select
  value={selectedProject}
  onChange={setSelectedProject}
  menuClassName="min-w-[220px]"
  options={[
    { value: "All", label: "Current Project" },
    ...projects.map((project) => ({ value: project._id, label: project.title })),
  ]}
/>
 
  <Select
  value={roleFilter}
  onChange={setRoleFilter}
  options={[
    {
      value: "All",
      label: "All Roles",
    },
    ...roleOptions,
  ]}
/>
 
     <Select
  value={statusFilter}
  onChange={setStatusFilter}
  options={[
    { value: "All", label: "All Status" },
    { value: "todo", label: "Todo" },
    { value: "in-progress", label: "In Progress" },
    { value: "review", label: "Review" },
    { value: "completed", label: "Completed" },
  ]}
/>
 
    </div>
 
    {/* RIGHT */}

    <div className="flex flex-wrap items-center gap-3 sm:gap-5">
 
      <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-green-200 dark:bg-green-500/30" />
          1–{hourBands.lowMax}h
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-blue-200 dark:bg-blue-500/30" />
          {hourBands.lowMax + 1}–{hourBands.midMax}h
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-orange-300 dark:bg-orange-500/30" />
          {hourBands.midMax + 1}–{hourBands.hoursPerDay}h
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-300 dark:bg-red-500/30" />
          Over
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded border border-slate-300 dark:border-slate-600"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 2px, #94a3b8 2px, #94a3b8 3px)",
            }}
          />
          Other work
        </span>
      </div>
 
      <div className="flex items-center gap-2">
 
  {/* <div className="w-4 h-4 rounded border border-slate-400 flex items-center justify-center dark:border-slate-600">
 
    <div className="w-2 h-2 rounded bg-slate-600 dark:bg-slate-400"></div>
 
  </div> */}
 
 <label className="flex items-center gap-2 text-xs cursor-pointer">
 
<input
  type="checkbox"
  checked={showBacklog}
  onChange={(e)=>setShowBacklog(e.target.checked)}
/>
 
Backlog box
 
</label>
 
</div>
     
<button
onClick={() => setCellWidth(Math.max(50, cellWidth - 10))}
className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition flex items-center justify-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
>
 
  <Minus size={18} />
 
</button>
<button
onClick={() => setCellWidth(Math.min(130, cellWidth + 10))}
className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition flex items-center justify-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
>
 
  <Plus size={18} />
 
</button>
 
    </div>
 
  </div>
 
</div>
{/* ================= TIMELINE CONTAINER ================= */}
<div className="mb-0 flex flex-wrap gap-2 rounded-t-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
  {(
    [
      ["timeline", "Timeline"],
      ["availability", "Availability"],
      ["utilization", "Utilization"],
    ] as const
  ).map(([id, label]) => (
    <button
      key={id}
      type="button"
      onClick={() => setResourceTab(id)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        resourceTab === id
          ? "bg-cyan-600 text-white"
          : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {label}
    </button>
  ))}
</div>

{resourceTab === "availability" && (
  <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Member</th>
          <th className="py-2">Available</th>
          <th className="py-2">Capacity</th>
          <th className="py-2">Allocated</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {visibleMembers.map((member) => (
          <tr key={member._id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-2 font-medium">{member.name}</td>
            <td className={member.remainingCapacity < 0 ? "text-red-600" : "text-emerald-600"}>
              {member.remainingCapacity}h available
            </td>
            <td>{member.capacity}h</td>
            <td>{member.allocatedHours}h</td>
            <td className={resourceStatusTone(member.resourceStatus)}>{member.resourceStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

{resourceTab === "utilization" && (
  <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Member</th>
          <th className="py-2">Capacity</th>
          <th className="py-2">Allocated</th>
          <th className="py-2">Utilization</th>
          <th className="py-2">Target</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {visibleMembers.map((member) => (
          <tr key={member._id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-2 font-medium">{member.name}</td>
            <td>{member.capacity}h</td>
            <td>{member.allocatedHours}h</td>
            <td>{member.utilization}%</td>
            <td>{member.utilizationTarget}%</td>
            <td className={resourceStatusTone(member.resourceStatus)}>
              {member.overallocated ? "Overallocated" : member.resourceStatus}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

{resourceTab === "timeline" && (
<div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
<div className="flex">

  {/* LEFT: member-info panel. A completely separate, non-scrolling
      column — not position:sticky, just never inside the
      horizontally-scrolling element at all — so it can never detach
      while the timeline on the right is scrolled, however far. */}
  <div className="w-[740px] shrink-0 border-r border-slate-200 dark:border-slate-800">

    <div className="sticky top-0 z-30 grid h-14 w-[740px] grid-cols-[290px_90px_90px_90px_90px_90px] items-center border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">

      <div className="flex h-full items-center px-5 font-semibold text-slate-900 dark:text-white">
        Member
      </div>

      <div
        className="flex h-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300"
        title={`Available hours in the selected date range (${hoursPerDay}h × weekdays, minus leave). Same for everyone in this range unless someone is on leave.`}
      >
        Capacity
      </div>

      <div
        className="flex h-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300"
        title="Total effort hours assigned to this person. Subtitle is the sum of each task's working days (from that task's start→due dates)."
      >
        Allocated
      </div>

      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
        Utilization
      </div>

      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
        Available
      </div>

      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
        Status
      </div>

    </div>

    <div className="sticky top-[56px] z-20 h-10 w-[740px] border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800" />

    {visibleMembers.map((member) => (
      <React.Fragment key={member._id}>
        <div
          onClick={() => setSelectedMember(member.name)}
          className={`relative grid h-[72px] grid-cols-[290px_90px_90px_90px_90px_90px] items-stretch border-t border-slate-200 dark:border-slate-800 transition-colors duration-300 cursor-pointer ${
            selectedMember === member.name
              ? "bg-gradient-to-r from-cyan-50 to-blue-50 border-l-4 border-cyan-400 dark:from-cyan-500/10 dark:to-blue-500/10 dark:border-cyan-500"
              : "hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >

          <div className="flex items-center gap-4 px-5 py-4 border-r border-slate-200 dark:border-slate-800">

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMember(member._id || member.name);
              }}
              className="mr-2 rounded-md p-1 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {expandedMembers.includes(member._id || member.name) ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>

            <UserAvatar
              name={member.name}
              color={member.avatarColor}
              seed={member._id || member.name}
              size={48}
              className={`transition-all duration-300 shadow-lg ${
                selectedMember === member.name ? "scale-110 ring-4 ring-cyan-300" : ""
              }`}
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white dark:border-slate-900" />

            <div className="flex-1 min-w-0">
              <h3
                className={`font-semibold truncate ${
                  selectedMember === member.name
                    ? "text-cyan-700 dark:text-cyan-400"
                    : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {member.name}
              </h3>

              <p className="text-xs text-slate-500 mt-1 truncate dark:text-slate-400">
                {member.role}
              </p>
            </div>

          </div>

          {/* Capacity = available time in the selected date filter */}
          <div
            className="flex flex-col items-center justify-center border-r border-slate-200 dark:border-slate-800"
            title={`${member.availableWorkingDays ?? Math.round(member.capacity / hoursPerDay)} available weekdays in the selected range × ${member.hoursPerDay || hoursPerDay}h/day`}
          >
            <span className="font-bold">{member.capacity}h</span>
          </div>

          {/* Allocated = task effort */}
          <div
            className="flex flex-col items-center justify-center border-r border-slate-200 dark:border-slate-800"
            title="Sum of effort hours on assigned tasks."
          >
            <span className="font-semibold">{member.allocatedHours}h</span>
          </div>

          {/* Utilization */}
          <div className="flex items-center justify-center border-r border-slate-200 dark:border-slate-800">
            <span
              className={`font-bold ${
                member.utilization > 100
                  ? "text-red-600"
                  : member.utilization >= 80
                  ? "text-orange-500"
                  : "text-green-600"
              }`}
            >
              {member.utilization}%
            </span>
          </div>

          {/* Available */}
          <div className="flex flex-col items-center justify-center border-r border-slate-200 dark:border-slate-800">
            <span
              className={`font-bold ${
                member.remainingCapacity < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {member.remainingCapacity}h
            </span>

            {member.remainingCapacity < 0 && (
              <span className="text-[10px] text-red-500">Over Capacity</span>
            )}
          </div>

          <div className="flex items-center justify-center border-r border-slate-200 px-1 text-center text-[11px] font-semibold dark:border-slate-800">
            <span className={resourceStatusTone(member.resourceStatus)}>
              {member.resourceStatus || member.workloadStatus}
            </span>
          </div>

        </div>

        {expandedMembers.includes(member._id) && (
          <>
            {member.tasks
              .filter((task: any) => {
                if (!task.startDate || !task.dueDate) return false;

                const start = new Date(task.startDate);
                start.setHours(0, 0, 0, 0);

                const end = new Date(task.dueDate);
                end.setHours(0, 0, 0, 0);

                const rangeStart = new Date(dateRange.start);
                rangeStart.setHours(0, 0, 0, 0);

                const rangeEnd = new Date(dateRange.end);
                rangeEnd.setHours(0, 0, 0, 0);

                return end >= rangeStart && start <= rangeEnd;
              })
              .sort(
                (a: any, b: any) =>
                  new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
              )
              .map((task: any) => (
                <div
                  key={task._id}
                  className="h-14 flex items-center gap-3 pl-16 pr-4 py-3 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                  onClick={() => void openWorkloadTask(task)}
                >
                  <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate dark:text-slate-100">
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {task.effortHours ? `${task.effortHours}h effort` : "0h effort"}
                      {task.workingDayCount
                        ? ` · ${task.workingDayCount} working day${task.workingDayCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}

            {(member.tasks || [])
              .filter((task: any) => task.unscheduled || !task.startDate || !task.dueDate)
              .map((task: any) => (
                <div
                  key={`unscheduled-${task._id}`}
                  className="h-14 flex items-center gap-3 pl-16 pr-4 py-3 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                  onClick={() => void openWorkloadTask(task)}
                >
                  <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate dark:text-slate-100">
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      Unscheduled · {task.effortHours ? `${task.effortHours}h effort` : "0h effort"}
                    </p>
                  </div>
                </div>
              ))}
          </>
        )}
      </React.Fragment>
    ))}

  </div>

  {/* RIGHT: the only horizontally-scrollable area */}
  <div
    ref={timelineScrollRef}
    onScroll={handleTimelineScroll}
    className="flex-1 min-w-0 overflow-x-auto overflow-y-visible"
  >
    <div className="relative" style={{ width: days.length * cellWidth }}>

    {todayIndex !== -1 && (
  <div
    className="absolute top-0 bottom-0 z-50 pointer-events-none"
    style={{
      left: `${todayIndex * cellWidth + cellWidth / 2}px`,
      width: "2px",
      background: "#FCA5A5",
      opacity: 0.7,
    }}
  />
)}

  {/* Week Header */}

  <div
  className="sticky top-0 z-30 grid h-14 items-center border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800"
  style={{
    gridTemplateColumns: `repeat(${days.length}, ${cellWidth}px)`,
  }}
>
    {Array.from({
  length: Math.ceil(days.length / 7),
}).map((_, weekIndex) => {

  const start = days[weekIndex * 7];
  const end = days[Math.min((weekIndex + 1) * 7 - 1, days.length - 1)];
  const startYear = start.fullDate.getFullYear();
  const endYear = end.fullDate.getFullYear();

  return (
    <div
      key={start.key}
      className="text-center py-4 border-l border-slate-200 dark:border-slate-800"
      style={{ gridColumn: `span ${Math.min(7, days.length - weekIndex * 7)}` }}
    >
      {start.month} {start.date}
      {startYear !== endYear ? ` ${startYear}` : ""} - {end.month} {end.date} {endYear}
    </div>
  );
})}
  </div>

  {/* Days Header */}

<div
  className="sticky top-[56px] z-20 grid border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800"
  style={{
    gridTemplateColumns: `repeat(${days.length}, ${cellWidth}px)`,
  }}
>
   {days.map((item) => {

  const isToday = isTodayDate(item.fullDate);

  return (

    <div
      key={item.key}
      className={`border-l border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center py-2
${
 isToday
  ? "bg-slate-100/70 dark:bg-slate-700/20"
    : isWeekendDay(item.fullDate)
    ? "bg-gray-100 dark:bg-slate-700"
    : ""
}`}
    >

<div
  className={`flex flex-col items-center justify-center rounded-lg px-2 py-1 transition-all ${
    isToday
      ? "bg-slate-200 dark:bg-slate-700"
      : ""
  }`}
>
  <span className="text-[11px] text-slate-500">
    {item.day}
  </span>

  <span
    className={`text-xs mt-1 ${
      isToday
        ? "font-bold text-slate-900 dark:text-white"
        : "text-slate-600 dark:text-slate-300"
    }`}
  >
    {item.date}
  </span>
</div>

    </div>

  );

})}
  </div>

{visibleMembers
.map((member)=>(

<React.Fragment key={member._id}>

<div
  onClick={() => setSelectedMember(member.name)}
  className="grid border-t border-slate-200 dark:border-slate-800 cursor-pointer"
  style={{
    gridTemplateColumns: `repeat(${days.length}, ${cellWidth}px)`,
  }}
>
 {member.workload
  .slice(0, days.length)
  .map((hour: any, i: number) => {
    const currentDate = new Date(days[i].fullDate);
currentDate.setHours(0, 0, 0, 0);

const isLeaveDay = member.leaves?.some((leave: any) => {

  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return (
    currentDate >= start &&
    currentDate <= end
  );

});

const leave = member.leaves?.find((leave: any) => {
  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return currentDate >= start && currentDate <= end;
});

const getLeaveIcon = (type?: string) => {
  switch ((type || "").toLowerCase()) {
    case "sick":
      return "🤒";
    case "casual":
      return "🏖";
    default:
      return "🏖";
  }
};
 
const previous = i > 0 ? member.workload[i-1] : -1;
const next = i < member.workload.length-1 ? member.workload[i+1] : -1;

const isToday = Boolean(days[i] && isTodayDate(days[i].fullDate));

const outsideHours = member.workloadOutside?.[i] || 0;
const dayCapacity =
  typeof member.dailyCapacity?.[i] === "number"
    ? member.dailyCapacity[i]
    : hoursPerDay;
const weekendCell = Boolean(days[i] && isWeekendDay(days[i].fullDate));
const totalDayHours = hour + outsideHours;
const isOverloaded =
  !isLeaveDay &&
  !weekendCell &&
  dayCapacity > 0 &&
  totalDayHours > dayCapacity;
const hasOutsideWork =
  outsideHours > 0 && !isLeaveDay && !weekendCell;
 
let color = isToday
  ? "bg-slate-100 dark:bg-slate-700/30"
  : "bg-slate-50 dark:bg-slate-800";

if (isLeaveDay) {

  switch ((leave?.leaveType || "").toLowerCase()) {

    case "casual":
      color = "bg-violet-100 text-violet-700 border border-violet-200";
      break;

    case "sick":
      color = "bg-rose-100 text-rose-700 border border-rose-200";
      break;

    case "earned":
      color = "bg-emerald-100 text-emerald-700 border border-emerald-200";
      break;

    default:
      color = "bg-violet-100 text-violet-700 border border-violet-200";

  }

}
let radius="";
if (!isLeaveDay) {
  const band = isOverloaded
    ? "over"
    : workloadCellBand(hour, dayCapacity);

  if (band === "low")
    color = isToday
      ? "bg-green-300 dark:bg-green-500/30"
      : "bg-green-200 dark:bg-green-500/20";

  if (band === "mid")
    color = isToday
      ? "bg-blue-300 dark:bg-blue-500/30"
      : "bg-blue-200 dark:bg-blue-500/20";

  if (band === "near")
    color = isToday
      ? "bg-orange-400 dark:bg-orange-500/40"
      : "bg-orange-300 dark:bg-orange-500/30";

  if (band === "over")
    color = isToday
      ? "bg-red-400 dark:bg-red-500/40"
      : "bg-red-300 dark:bg-red-500/30";
   

} else {
  // Leave color already set above
}
 
if(previous===0 && hour>0)
radius+=" rounded-l-xl";
 
if(next===0 && hour>0)
radius+=" rounded-r-xl";
 
return(
 
<div
key={days[i]?.key ?? i}
title={
  isLeaveDay
    ? `${member.name} • Leave`
    : weekendCell
    ? `${member.name} • Non-working`
    : `${member.name} • ${hour}h here${
        hasOutsideWork ? ` • ${outsideHours}h other work` : ""
      } • ${dayCapacity}h capacity${isOverloaded ? " • Over" : ""}`
}
className={`
relative
group
h-[72px]
overflow-visible
border-l
border-slate-200
dark:border-slate-800
flex
items-center
justify-center
transition-colors
duration-200
cursor-pointer
text-slate-800
dark:text-slate-200
hover:brightness-95
hover:z-50
 
${
  isToday
  ? "ring-1 ring-slate-200 dark:ring-slate-700"
  : ""
}
 
${
  days[i] && isWeekendDay(days[i].fullDate)
    ? "bg-gray-100 dark:bg-slate-700"
    : color
}
 
${radius}
`}
>
{hasOutsideWork && (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-0 text-slate-500/50 dark:text-slate-400/40"
    style={{
      backgroundImage:
        "repeating-linear-gradient(-45deg, transparent, transparent 3px, currentColor 3px, currentColor 5px)",
    }}
  />
)}

 
{showHours
  ? days[i] && isWeekendDay(days[i].fullDate)
    ? ""
    : isLeaveDay
    ? getLeaveIcon(leave?.leaveType)
    : hour === 0
    ? "0"
    : `${hour}h`
  : ""}

{(hour > 0 || isLeaveDay) && (
  <div
    className="absolute left-1/2 top-full z-[60] mt-2 w-max min-w-[200px] -translate-x-1/2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs shadow-xl text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
  >
    {isLeaveDay ? (
    <>
  {(() => {
    const leave = member.leaves?.find((leave: any) => {
      const s = new Date(leave.startDate);
      const e = new Date(leave.endDate);

      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);

      return currentDate >= s && currentDate <= e;
    });

    if (!leave) return null;

    return (
      <div className="min-w-[220px]">
        <p className="font-semibold text-sm">
          {getLeaveIcon(leave.leaveType)} {leave.leaveType} Leave
        </p>

        <p className="mt-2 text-xs">
          📅{" "}
          {new Date(leave.startDate).toLocaleDateString()} →{" "}
          {new Date(leave.endDate).toLocaleDateString()}
        </p>

        <p className="mt-2 text-xs">
          📝 {leave.reason || "No reason provided"}
        </p>
      </div>
    );
  })()}
</>
    ) : (
      <>
        <p className="font-semibold">{member.name}</p>
        <p className="mt-1">{hour}h in this view</p>
        {hasOutsideWork && (
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">
            {outsideHours}h on other work
          </p>
        )}
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
          Capacity {dayCapacity}h
        </p>
        {isOverloaded && (
          <p className="mt-1 font-medium text-red-600">Over capacity</p>
        )}
      </>
    )}
  </div>
)}
</div>

)
})}
</div>

{expandedMembers.includes(member._id) && (
<>

{member.tasks
.filter((task:any)=>{

if (!task.startDate || !task.dueDate) return false;

const start=new Date(task.startDate);
start.setHours(0, 0, 0, 0);

const end=new Date(task.dueDate);
end.setHours(0, 0, 0, 0);

const rangeStart = new Date(dateRange.start);
rangeStart.setHours(0, 0, 0, 0);

const rangeEnd = new Date(dateRange.end);
rangeEnd.setHours(0, 0, 0, 0);

// Only keep tasks that overlap the visible date range
return (
end>=rangeStart &&
start<=rangeEnd
);

})
.sort(
  (a: any, b: any) =>
    new Date(a.startDate).getTime() -
    new Date(b.startDate).getTime()
)
.map((task: any, index: number) => {

const start = new Date(task.startDate);
const end = new Date(task.dueDate);

start.setHours(0, 0, 0, 0);
end.setHours(0, 0, 0, 0);

const rangeStart = new Date(dateRange.start);
rangeStart.setHours(0, 0, 0, 0);

const rangeEnd = new Date(dateRange.end);
rangeEnd.setHours(0, 0, 0, 0);

// Clamp task bar to the visible timeline
const visibleStart =
  start < rangeStart ? rangeStart : start;
const visibleEnd =
  end > rangeEnd ? rangeEnd : end;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

let startIndex = Math.round(
  (visibleStart.getTime() - rangeStart.getTime()) / MS_PER_DAY
);
let endIndex = Math.round(
  (visibleEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY
);

startIndex = Math.max(0, Math.min(startIndex, days.length - 1));
endIndex = Math.max(startIndex, Math.min(endIndex, days.length - 1));

const offset = startIndex;

const totalDays =
  endIndex - startIndex + 1;
  const leaveDates = member.leaves ?? [];

const taskWorkingDays = days.filter((day) => {
  const current = new Date(day.fullDate);
  current.setHours(0, 0, 0, 0);

  return !leaveDates.some((leave: any) => {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return current >= start && current <= end;
  });
});

  const hasLeaveConflict = member.leaves?.some((leave: any) => {

  const leaveStart = new Date(leave.startDate);
  const leaveEnd = new Date(leave.endDate);

  const taskStart = new Date(task.startDate);
  const taskEnd = new Date(task.dueDate);

  leaveStart.setHours(0, 0, 0, 0);
  leaveEnd.setHours(0, 0, 0, 0);

  taskStart.setHours(0, 0, 0, 0);
  taskEnd.setHours(0, 0, 0, 0);

  return (
    taskStart <= leaveEnd &&
    taskEnd >= leaveStart
  );

});

  const getTaskBarColor = (task: any) => { 
  const status = (task.status || "").toLowerCase();
  const priority = (task.priority || "").toLowerCase();

  // Status takes priority
  if (status === "completed") return "#94A3B8";   // Gray
  if (status === "in-progress") return "#3B82F6"; // Blue
  if (status === "review") return "#8B5CF6";      // Purple

  // Otherwise use priority
  if (priority === "high") return "#EF4444";      // Red
  if (priority === "medium") return "#F59E0B";    // Orange
  if (priority === "low") return "#22C55E";       // Green

  return "#64748B"; // Default Slate
};

      


  return (

    <div
      key={task._id}
      className="group/task relative z-10 h-14 overflow-visible border-t border-slate-100 hover:z-40 dark:border-slate-800"
      style={{
        width: days.length * cellWidth,
      }}
    >

        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${days.length}, ${cellWidth}px)`,
          }}
        >
          {days.map((day) => (
            <div
              key={day.key}
              className="border-l border-slate-200 dark:border-slate-800 h-full"
            />
          ))}
        </div>


         <div
  onClick={() => {
    void openWorkloadTask(task);
  }}
  className={`absolute group z-20 top-2.5 h-9 rounded-xl text-white flex items-center px-3 text-xs font-medium shadow-md transition-transform duration-200 cursor-pointer box-border ${
  selectedTask || openingTaskId === task._id
    ? ""
    : "hover:z-[40] hover:scale-[1.02]"
} ${
  hasLeaveConflict
  ? "border-2 border-red-500"
  : ""
}`}
  style={{
    left: offset * cellWidth + 4,
    width: Math.max(totalDays * cellWidth - 8, 24),
  background: getTaskBarColor(task),
    overflow: "visible",
  }}
>
  <span className="truncate flex items-center gap-1">

 

  {task.title}

</span>

  {/* Tooltip — hidden while task dialog is open so hover UI can't sit on top of it */}
  {!selectedTask && (
  <div
    className="
      absolute
      left-0
      top-full
      mt-2
      hidden
      group-hover:block
      z-[60]
      w-64
      rounded-xl
      bg-white
      border
      border-slate-200
      shadow-2xl
      p-4
      text-slate-800
      dark:bg-slate-900
      dark:border-slate-700
      dark:text-slate-100
    "
  >
    <h3 className="font-semibold text-sm">
      {task.title}
    </h3>

    <div className="mt-3 space-y-2 text-xs">
      <p>
        👤 <strong>{member.name}</strong>
      </p>

      <p>
        📅 {start.toLocaleDateString()} →{" "}
        {end.toLocaleDateString()}
      </p>

      <p>
        ⏱ {task.effortHours ? `${task.effortHours}h effort` : "0h effort"}
      </p>

      <p>
        🚩 {task.priority || "Normal"}
      </p>
    </div>
  </div>
  )}
</div>

  </div>


  );

})}
{(member.tasks || [])
  .filter(
    (task: any) =>
      task.unscheduled || !task.startDate || !task.dueDate
  )
  .map((task: any) => (
    <div
      key={`unscheduled-${task._id}`}
      className="relative z-10 flex h-14 items-center border-t border-slate-100 px-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
      onClick={() => void openWorkloadTask(task)}
      style={{ width: days.length * cellWidth }}
    >
        Set start and due dates to place this on the timeline
    </div>
  ))}
{/*
{member.leaves?.map((leave: any, index: number) => {

  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);

  const offset = getWorkingDayIndex(start);

  const totalDays = getWorkingDaysBetween(start, end);

  return (

    <div
      key={`leave-${leave._id}`}
      className="grid border-t border-slate-100 dark:border-slate-800"
      style={{
        gridTemplateColumns: `290px 90px 90px 90px 90px 90px repeat(${days.length}, ${cellWidth}px)`,
      }}
    >


      <div className="flex items-center gap-3 pl-16 pr-4 py-3 border-r border-slate-200 dark:border-slate-800">

        <div className="w-2 h-2 rounded-full bg-red-500" />

        <div>

          <p className="text-sm font-medium text-red-600">
            {leave.leaveType} Leave
          </p>

          <p className="text-xs text-slate-400">
            {leave.reason}
          </p>

        </div>

      </div>

      

      <div
        className="relative"
        style={{
          gridColumn: `span ${days.length}`,
        }}
      >

        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${days.length}, ${cellWidth}px)`,
          }}
        >

          {days.map((_, i) => (

            <div
              key={i}
              className="border-l border-slate-200 dark:border-slate-800 h-[52px]"
            />

          ))}

        </div>

        <div
          className="absolute top-2 h-9 rounded-xl bg-red-500 text-white flex items-center px-3 text-xs font-medium shadow-md"
          style={{
            left: offset * cellWidth + 4,
            width: totalDays * cellWidth - 8,
          }}
        >

          {leave.leaveType} Leave

        </div>

      </div>

    </div>

  );

})}
  */}

</>

)}

</React.Fragment>

))}

    </div>
  </div>

</div>

<div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
 
<div className="flex flex-wrap items-center gap-2">
 
  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
    <div className="w-3 h-3 rounded-full bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600" />
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">0h</span>
  </div>
 
  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
    <div className="w-3 h-3 rounded-full bg-green-200 dark:bg-green-500/30" />
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">1 - {hourBands.lowMax}h</span>
  </div>
 
  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
    <div className="w-3 h-3 rounded-full bg-blue-200 dark:bg-blue-500/30" />
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{hourBands.lowMax + 1} - {hourBands.midMax}h</span>
  </div>
 
  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
    <div className="w-3 h-3 rounded-full bg-orange-300 dark:bg-orange-500/40" />
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{hourBands.midMax + 1} - {hourBands.hoursPerDay}h</span>
  </div>
 
  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
    <div className="w-3 h-3 rounded-full bg-red-300 dark:bg-red-500/40" />
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Over {hourBands.hoursPerDay}h</span>
  </div>
 
</div>

</div>
</div>
)}

{selectedTask && (
  <TaskDetailDialog
    key={selectedTask._id}
    task={selectedTask}
    projectId={String(selectedTask.project?._id || selectedTask.project)}
    canEdit={true}
    statusOptions={taskDialogMeta?.statusOptions}
    customFields={taskDialogMeta?.customFields}
    otherCustomFields={taskDialogMeta?.otherCustomFields}
    cardPreviewConfig={taskDialogMeta?.cardPreviewConfig}
    adoptedCustomFieldIds={taskDialogMeta?.adoptedCustomFieldIds}
    organizationId={taskDialogMeta?.organizationId}
    isPersonalProject={taskDialogMeta?.isPersonalProject}
    onClose={() => {
      setSelectedTask(null);
      setTaskDialogMeta(null);
    }}
    onUpdated={(updatedTask) => {
      setSelectedTask(updatedTask);
      void fetchWorkload();
    }}
    onDeleted={() => {
      setSelectedTask(null);
      setTaskDialogMeta(null);
      void fetchWorkload();
    }}
  />
)}
 
        </main>
 
      </div>
 
    </div>
  );
}
 