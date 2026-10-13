"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import EditOrganizationDialog from "@/components/organizations/EditOrganizationDialog";
import { confirmAndDeleteOrganization } from "@/lib/deleteOrganization";
import { toast } from "@/components/ui/toast";
import { writeStoredOrgId } from "@/lib/orgStorage";
import { authFetch } from "@/lib/validation/authFetch";
import { Clock } from "lucide-react";

export default function EditOrganizationPage() {
  const router = useRouter();
  const { currentOrg, access, setCurrentOrgId, refreshAccess } =
    useOrganization();
  const { canUpdateOrg, orgReady } = useOrgPermission();
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) router.push("/login");
  }, [router]);

  useEffect(() => {
    if (currentOrg?.hoursPerDay != null) {
      setHoursPerDay(String(currentOrg.hoursPerDay));
    } else {
      setHoursPerDay("8");
    }
  }, [currentOrg?.hoursPerDay, currentOrg?.organizationId]);

  useEffect(() => {
    if (!orgReady || !currentOrg) return;
    if (!canUpdateOrg) router.replace("/settings/organization");
  }, [orgReady, currentOrg, canUpdateOrg, router]);

  const handleSaveHours = async () => {
    const hours = Number(hoursPerDay);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
      toast.error("Daily hours must be between 1 and 24");
      return;
    }
    setSavingHours(true);
    try {
      const res = await authFetch(
        `/organizations/${currentOrg?.organizationId}/work-hours`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hoursPerDay: hours }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Could not save work hours");
      }
      setHoursPerDay(String(data.hoursPerDay ?? hours));
      await refreshAccess();
      toast.success("Daily work hours updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save work hours");
    } finally {
      setSavingHours(false);
    }
  };

  if (orgReady && currentOrg && !canUpdateOrg) {
    return null;
  }

  if (!currentOrg) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-2">Edit organization</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Switch into an organization from the top navigation to edit or delete
          it.
        </p>
      </div>
    );
  }

  const canDelete = currentOrg?.role === "owner";

  const handleDelete = async () => {
    setDeleting(true);
    await confirmAndDeleteOrganization({
      organizationId: currentOrg?.organizationId,
      name: currentOrg?.name,
      onError: (msg) => toast.error(msg),
      onSuccess: async () => {
        try {
          const res = await authFetch("/auth/switch-personal", {
            method: "POST",
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.token) {
            localStorage.setItem("token", data.token);
          }
        } catch {
          /* ignore */
        }
        writeStoredOrgId(null);
        setCurrentOrgId(null);
        await refreshAccess();
        toast.success("Organization deleted");
        const remaining =
          access?.organizations.filter(
            (o) => o.organizationId !== currentOrg?.organizationId
          ) || [];
        router.push(
          remaining.length ? "/dashboard" : "/settings/create-organization"
        );
      },
    });
    setDeleting(false);
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Edit organization</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Update the name, logo, and daily work hours for{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {currentOrg?.name}
          </span>
          , or permanently delete the organization.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Organization details
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Change the organization name and logo.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={() => setShowEdit(true)}
        >
          Edit details
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Clock size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daily work hours
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Team Workload treats this as a full working day for everyone in
              this organization. Existing tasks keep their effort; only
              capacity and utilization change.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor="org-hours-per-day">
                Hours per working day
              </label>
              <input
                id="org-hours-per-day"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
                className="field-input w-28"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                hours / day
              </span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingHours}
                onClick={() => void handleSaveHours()}
              >
                {savingHours ? "Saving…" : "Save hours"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {canDelete ? (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-red-800/80 dark:text-red-300/80">
            Permanently delete{" "}
            <span className="font-medium">{currentOrg?.name}</span>. Projects and
            tasks belonging to it will be removed. User accounts are preserved.
            This cannot be undone.
          </p>
          <button
            type="button"
            className="btn mt-4 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? "Deleting…" : "Delete Organization"}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Delete organization
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Only the organization owner can delete this organization.
          </p>
        </section>
      )}

      {showEdit && (
        <EditOrganizationDialog
          orgId={currentOrg?.organizationId}
          name={currentOrg?.name}
          description=""
          hasLogo={Boolean(currentOrg?.hasLogo)}
          logoUpdatedAt={currentOrg?.logoUpdatedAt || null}
          onClose={() => setShowEdit(false)}
          onSaved={async () => {
            setShowEdit(false);
            await refreshAccess();
            toast.success("Organization updated");
          }}
        />
      )}
    </div>
  );
}
