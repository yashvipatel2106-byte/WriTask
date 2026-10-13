"use client";

import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import ReportEditor, {
  type EditorValue,
} from "@/components/reports/ReportEditor";
import type { SavedReport } from "@/lib/reports/types";

type Props = {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  submitting?: boolean;
  error?: string;
  initial?: SavedReport | null;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (value: EditorValue) => void;
};

export default function CreateReportDialog({
  open,
  workspaceId,
  workspaceName,
  submitting,
  error,
  initial,
  title = "Create report",
  submitLabel = "Create",
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null;
  return (
    <ModalShell
      onClose={onClose}
      maxWidth="5xl"
      className="flex max-h-[92vh] flex-col overflow-hidden p-0"
    >
      <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
        <ModalHeader title={title} onClose={onClose} className="mb-4" />
      </div>
      <ReportEditor
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        initial={initial}
        submitting={submitting}
        error={error}
        submitLabel={submitLabel}
        inDialog
        onCancel={onClose}
        onSubmit={onSubmit}
      />
    </ModalShell>
  );
}
