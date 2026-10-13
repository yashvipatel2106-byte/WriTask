"use client";

import type { ReactNode } from "react";
import { buildStatusLabels, type CustomStatus } from "@/lib/taskStatuses";
import { PRIORITY_CHIP } from "@/lib/constants/taskPriority";
import {
  formatCardDateNumeric,
  formatEffortHours,
} from "@/lib/taskDisplayFormat";
import {
  formatCustomFieldValue,
  getTaskCustomFieldValue,
  hasCustomFieldDisplayValue,
  type TaskCustomFieldValue,
} from "@/lib/customFieldValues";
import {
  CARD_PREVIEW_FIELD_LABELS,
  type CardPreviewDefaultFieldId,
  type ProjectCustomField,
} from "@/lib/kanbanCardPreview";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import type { TaskItem } from "./KanbanBoard";

type CardTask = TaskItem & {
  effortHours?: number | null;
  durationHours?: number | null;
  workingDayCount?: number | null;
  customFieldValues?: TaskCustomFieldValue[];
  createdBy?: { _id?: string; username?: string; avatarColor?: string };
};

type AssigneeLike = {
  _id: string;
  username: string;
  avatarColor?: string;
};

export function AssigneeAvatars({
  assignees,
  max = 3,
}: {
  assignees: AssigneeLike[];
  max?: number;
}) {
  if (assignees.length === 0) return null;

  return (
    <div
      className="flex items-center -space-x-1.5 shrink-0"
      title={assignees.map((a) => a.username).join(", ")}
    >
      {assignees.slice(0, max).map((a) => (
        <div
          key={a._id}
          className={`w-5 h-5 rounded-full ${avatarBg(a.avatarColor, a._id || a.username).className} ring-2 ring-white flex items-center justify-center text-[9px] font-semibold text-white dark:ring-slate-800`}
          style={avatarBg(a.avatarColor, a._id || a.username).style}
        >
          {avatarInitials(a.username)}
        </div>
      ))}
      {assignees.length > max && (
        <div className="w-5 h-5 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:ring-slate-800 dark:text-slate-300">
          +{assignees.length - max}
        </div>
      )}
    </div>
  );
}

function KanbanCardFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,46%)_minmax(0,1fr)] gap-x-3 items-start py-0.5">
      <span className="text-[11px] text-slate-400 leading-snug dark:text-slate-500">
        {label}
      </span>
      <div className="min-w-0 text-[11px] leading-snug text-slate-800 dark:text-slate-200">
        {children}
      </div>
    </div>
  );
}

function EmptyValue() {
  return (
    <span className="text-slate-300 dark:text-slate-600">Empty</span>
  );
}

type DefaultFieldProps = {
  task: CardTask;
  fieldId: CardPreviewDefaultFieldId;
  customStatuses?: CustomStatus[];
};

export function KanbanDefaultCardField({
  task,
  fieldId,
  customStatuses = [],
}: DefaultFieldProps) {
  const statusLabels = buildStatusLabels(customStatuses);
  const label = CARD_PREVIEW_FIELD_LABELS[fieldId];

  switch (fieldId) {
    case "status": {
      const value = statusLabels[task.status] || task.status;
      return (
        <KanbanCardFieldRow label={label}>
          {value ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-cyan-500 shrink-0" />
              <span className="inline-flex px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-700 font-medium capitalize dark:bg-cyan-500/15 dark:text-cyan-300">
                {value}
              </span>
            </span>
          ) : (
            <EmptyValue />
          )}
        </KanbanCardFieldRow>
      );
    }
    case "priority":
      return (
        <KanbanCardFieldRow label={label}>
          {task.priority ? (
            <span
              className={`inline-flex px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold ${
                PRIORITY_CHIP[task.priority] ||
                "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800"
              }`}
            >
              {task.priority}
            </span>
          ) : (
            <EmptyValue />
          )}
        </KanbanCardFieldRow>
      );
    case "author": {
      const author = task.createdBy;
      return (
        <KanbanCardFieldRow label={label}>
          {author?.username ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span
                className={`w-5 h-5 rounded-md shrink-0 ${avatarBg(author.avatarColor, author._id || author.username).className} flex items-center justify-center text-[9px] font-bold text-white`}
                style={
                  avatarBg(author.avatarColor, author._id || author.username).style
                }
              >
                {avatarInitials(author.username)}
              </span>
              <span className="truncate">{author.username}</span>
            </span>
          ) : (
            <EmptyValue />
          )}
        </KanbanCardFieldRow>
      );
    }
    case "startDate": {
      const value = formatCardDateNumeric(task.startDate);
      return (
        <KanbanCardFieldRow label={label}>
          {value || <EmptyValue />}
        </KanbanCardFieldRow>
      );
    }
    case "endDate": {
      const value = formatCardDateNumeric(task.dueDate);
      return (
        <KanbanCardFieldRow label={label}>
          {value || <EmptyValue />}
        </KanbanCardFieldRow>
      );
    }
    case "effort": {
      const value = formatEffortHours(task.effortHours);
      return (
        <KanbanCardFieldRow label={label}>
          {value || <EmptyValue />}
        </KanbanCardFieldRow>
      );
    }
    case "attachments": {
      const count = task.attachments?.length ?? 0;
      return (
        <KanbanCardFieldRow label={label}>
          {count > 0 ? count : <EmptyValue />}
        </KanbanCardFieldRow>
      );
    }
    case "itemType":
      return (
        <KanbanCardFieldRow label={label}>
          Task
        </KanbanCardFieldRow>
      );
    case "lastModified": {
      const value = formatCardDateNumeric(task.updatedAt);
      return (
        <KanbanCardFieldRow label={label}>
          {value || <EmptyValue />}
        </KanbanCardFieldRow>
      );
    }
    default:
      return null;
  }
}

export function KanbanCustomCardField({
  task,
  field,
}: {
  task: CardTask;
  field: ProjectCustomField;
}) {
  const value = getTaskCustomFieldValue(task.customFieldValues, field.id);
  const hasValue = hasCustomFieldDisplayValue(field, value);

  return (
    <KanbanCardFieldRow label={field.name}>
      {hasValue ? formatCustomFieldValue(field, value) : <EmptyValue />}
    </KanbanCardFieldRow>
  );
}

export { formatCustomFieldValue };
