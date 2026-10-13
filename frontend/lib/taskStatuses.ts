export type CustomStatus = {
  id: string;
  label: string;
};

export type StatusColumn = {
  id: string;
  label: string;
  accent: string;
  border: string;
  headerBg: string;
  custom?: boolean;
};

export const DEFAULT_STATUS_IDS = [
  "todo",
  "in-progress",
  "review",
  "completed",
] as const;

export const DEFAULT_COLUMNS: StatusColumn[] = [
  {
    id: "todo",
    label: "To Do",
    accent: "bg-gray-400",
    border: "border-gray-500/30",
    headerBg: "bg-gray-500/10",
  },
  {
    id: "in-progress",
    label: "In Progress",
    accent: "bg-cyan-400",
    border: "border-cyan-500/30",
    headerBg: "bg-cyan-500/10",
  },
  {
    id: "review",
    label: "Review",
    accent: "bg-amber-400",
    border: "border-amber-500/30",
    headerBg: "bg-amber-500/10",
  },
  {
    id: "completed",
    label: "Completed",
    accent: "bg-emerald-400",
    border: "border-emerald-500/30",
    headerBg: "bg-emerald-500/10",
  },
];

const CUSTOM_COLUMN_STYLES = [
  {
    accent: "bg-purple-400",
    border: "border-purple-500/30",
    headerBg: "bg-purple-500/10",
  },
  {
    accent: "bg-pink-400",
    border: "border-pink-500/30",
    headerBg: "bg-pink-500/10",
  },
  {
    accent: "bg-indigo-400",
    border: "border-indigo-500/30",
    headerBg: "bg-indigo-500/10",
  },
  {
    accent: "bg-teal-400",
    border: "border-teal-500/30",
    headerBg: "bg-teal-500/10",
  },
  {
    accent: "bg-orange-400",
    border: "border-orange-500/30",
    headerBg: "bg-orange-500/10",
  },
];

export function slugifyStatusLabel(
  label: string,
  reserved: string[] = []
): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") || `status-${Date.now()}`;

  if (!reserved.includes(base)) return base;

  let suffix = 2;
  while (reserved.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function buildStatusColumns(
  customStatuses: CustomStatus[] = []
): StatusColumn[] {
  const customColumns = customStatuses.map((status, index) => {
    const style =
      CUSTOM_COLUMN_STYLES[index % CUSTOM_COLUMN_STYLES.length];
    return {
      id: status.id,
      label: status.label,
      custom: true,
      ...style,
    };
  });

  return [...DEFAULT_COLUMNS, ...customColumns];
}

export function buildStatusOptions(customStatuses: CustomStatus[] = []) {
  return [
    ...DEFAULT_COLUMNS.map((column) => ({
      value: column.id,
      label: column.label,
    })),
    ...customStatuses.map((status) => ({
      value: status.id,
      label: status.label,
    })),
  ];
}

export function buildStatusLabels(
  customStatuses: CustomStatus[] = []
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const column of DEFAULT_COLUMNS) {
    labels[column.id] = column.label;
  }
  for (const status of customStatuses) {
    labels[status.id] = status.label;
  }
  return labels;
}
