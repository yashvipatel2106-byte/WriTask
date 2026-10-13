"use client";

/**
 * Shared delete-organization flow: soft-trash then permanent delete.
 * Used by Account settings, Edit Organization, and Delete Organization pages.
 */
import { authFetch } from "@/lib/validation/authFetch";
import { clearStoredProjectId } from "@/lib/orgStorage";
import { clearStoredWorkspaceId } from "@/lib/workspaceStorage";
import { confirmDialog } from "@/components/ui/confirm";

export async function confirmAndDeleteOrganization(opts: {
  organizationId: string;
  name: string;
  onSuccess: () => void | Promise<void>;
  onError?: (message: string) => void;
}): Promise<boolean> {
  const ok = await confirmDialog({
    title: `Delete Organization?`,
    description: `Are you sure you want to delete "${opts.name}"?\n\nThis action will permanently delete the organization and its organization-specific data.`,
    confirmLabel: "Delete Organization",
    variant: "danger",
  });
  if (!ok) return false;

  const trashRes = await authFetch(
    `/organizations/${opts.organizationId}/trash`,
    { method: "PATCH" }
  );
  if (!trashRes.ok) {
    const data = await trashRes.json().catch(() => ({}));
    opts.onError?.(data.message || "Failed to delete organization");
    return false;
  }

  const deleteRes = await authFetch(
    `/trash/organizations/${opts.organizationId}`,
    { method: "DELETE" }
  );
  if (!deleteRes.ok) {
    const data = await deleteRes.json().catch(() => ({}));
    opts.onError?.(
      data.message ||
        "Organization was moved to trash, but permanent deletion failed"
    );
    return false;
  }

  clearStoredProjectId();
  clearStoredWorkspaceId();
  await opts.onSuccess();
  return true;
}
