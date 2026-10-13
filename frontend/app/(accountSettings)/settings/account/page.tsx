"use client";

import { useOrganization } from "@/components/context/organizationContext";
import { authFetch } from "@/lib/validation/authFetch";
import { clearStoredProjectId } from "@/lib/orgStorage";
import { clearAuthStorage } from "@/lib/validation/authStorage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

import { formatRoleLabel } from "@/lib/rbac";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Profile = {
  _id: string;
  username: string;
  email: string;
  phone?: string;
  designation?: string;
  department?: string;
  location?: string;
  profileMeta?: {
    isOrgOwner?: boolean;
    departmentLocked?: boolean;
    designationLocked?: boolean;
  };
};


export default function AccountInfoPage() {
  const router = useRouter();
  const { user, loading, profileReady } = useAuth();
  const { access, currentOrg, setCurrentOrgId, refreshAccess } = useOrganization();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Must be the active workspace specifically — never an arbitrary org the user
  // happens to own, so deleting always targets what's actually on screen.
  const deletableOrg = currentOrg?.role === "owner" ? currentOrg : null;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
  }, [router]);

  const acceptInvite = async (token: string) => {
    setAcceptingId(token);
    const res = await authFetch("/organizations/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setAcceptingId(null);

    if (res.ok) {
      await refreshAccess();
      if (data.organization?._id) {
        setCurrentOrgId(data.organization._id);
      }
      router.push("/dashboard");
    } else {
      toast.error(data.message || "Failed to accept invitation");
    }
  };

  const handleDeleteOrganization = async () => {
    if (!deletableOrg) return;

    const ok = await confirmDialog({
      title: `Permanently delete "${deletableOrg.name}"?`,
      description:
        "This will permanently delete all of its projects, tasks, and members. This cannot be undone.",
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingOrg(true);

    const trashRes = await authFetch(`/organizations/${deletableOrg.organizationId}/trash`, {
      method: "PATCH",
    });
    if (!trashRes.ok) {
      setDeletingOrg(false);
      const data = await trashRes.json().catch(() => ({}));
      toast.error(data.message || "Failed to delete organization");
      return;
    }

    const deleteRes = await authFetch(`/trash/organizations/${deletableOrg.organizationId}`, {
      method: "DELETE",
    });
    setDeletingOrg(false);

    if (deleteRes.ok) {
      clearStoredProjectId();
      setCurrentOrgId(null);
      await refreshAccess();
      toast.success("Organization deleted permanently");
      router.push("/dashboard");
    } else {
      const data = await deleteRes.json().catch(() => ({}));
      toast.error(
        data.message ||
          "Organization was moved to trash, but permanent deletion failed"
      );
    }
  };

  const designation =
    user?.profileMeta?.isOrgOwner ? "admin" : user?.designation || "—";

  if (loading && !profileReady) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Loading account information...</div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">Account info</h1>
      <p className="text-slate-500 mb-8 dark:text-slate-400">
        Your personal account details and organization memberships.
      </p>

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Your account</h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Name</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">{user?.username || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">{user?.email || "—"}</dd>
          </div>

          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">{user?.phone || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Country</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">{user?.location || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Designation</dt>
            <dd className="text-slate-900 mt-1 capitalize wrap-break-word dark:text-slate-100">{designation}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Department</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">{user?.department || "—"}</dd>
          </div>
        </dl>
        <Link
          href="/profile/edit"
          className="inline-block mt-5 text-cyan-700 text-sm hover:underline dark:text-cyan-400"
        >
          Edit profile details
        </Link>
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">Organizations</h2>
        <p className="text-slate-500 text-sm mb-4 dark:text-slate-400">
          Workspaces your account belongs to. When you sign in, you land directly
          in your active workspace.
        </p>

        {access?.pendingInvitations && access.pendingInvitations.length > 0 && (
          <div className="mb-4 space-y-2">
            {access.pendingInvitations
              .filter((invite) => invite?.organization)
              .map((invite) => (
              <div
                key={invite._id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl dark:bg-slate-800"
              >
                <div className="min-w-0">
                   <p className="font-medium text-slate-900 truncate dark:text-slate-100">
                    {invite.organization?.name ?? "Unknown organization"}
                  </p>
                  <p className="text-slate-500 text-sm truncate dark:text-slate-400">
                    Invited as {formatRoleLabel(invite.role)}
                  </p>
                </div>
                <button
                  onClick={() => acceptInvite(invite.token)}
                  disabled={acceptingId === invite.token}
                  className="shrink-0 px-4 py-2 rounded-lg bg-cyan-50 text-cyan-700 text-sm disabled:opacity-50 dark:bg-cyan-400/10 dark:text-cyan-400"
                >
                  {acceptingId === invite.token ? "Joining..." : "Join"}
                </button>
              </div>
            ))}
          </div>
        )}

        {access?.organizations && access.organizations.length > 0 ? (
          <div className="space-y-2">
            {access.organizations.map((org) => (
              <div
                key={org.organizationId}
                className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${
                  currentOrg?.organizationId === org.organizationId
                    ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/20 dark:bg-cyan-400/10"
                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate dark:text-slate-100">{org.name}</p>
                  <p className="text-slate-500 text-sm capitaliz truncate dark:text-slate-400">
                    {formatRoleLabel(org.role)}
                    {currentOrg?.organizationId === org.organizationId &&
                      " · Active workspace"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {currentOrg?.organizationId !== org.organizationId && (
                    <button
                      onClick={() => {
                        clearStoredProjectId();
                        setCurrentOrgId(org.organizationId);
                        router.push("/dashboard");
                      }}
                      className="px-3 py-1.5 rounded-lg text-sm border border-cyan-300 text-cyan-700 dark:border-cyan-400/30 dark:text-cyan-400"
                    >
                      Switch
                    </button>
                  )}
                  {(org.role === "owner" || org.role === "admin") && (
                    <Link
                      href={`/organizations/${org.organizationId}/members`}
                      className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200"
                    >
                      Members
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm dark:text-slate-400">
            You are not part of any organization yet.
          </p>
        )}

        <Link
          href="/settings/create-organization"
          className="inline-block mt-5 bg-gradient-to-r bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          Create your own organization
        </Link>
        <p className="text-slate-400 text-xs mt-2 dark:text-slate-500">
          Start a new workspace for your team, even if you joined another
          organization by email.
        </p>
      </section>

      {deletableOrg && (
        <section className="bg-white border border-red-200 shadow-sm rounded-2xl p-6 dark:bg-slate-900 dark:border-red-500/20">
          <h2 className="text-lg font-semibold text-red-600 mb-2 dark:text-red-400">Delete Organization</h2>
          <p className="text-slate-500 text-sm mb-4 wrap-break-word dark:text-slate-400">
            Permanently delete <span className="font-medium">{deletableOrg.name}</span> (your current
            workspace) and all of its projects, tasks, and member access. This cannot be undone.
          </p>
          <button
            onClick={handleDeleteOrganization}
            disabled={deletingOrg}
            className="px-5 py-2.5 rounded-xl border border-red-300 text-red-600 text-sm disabled:opacity-50 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            {deletingOrg ? "Deleting..." : "Delete organization"}
          </button>
        </section>
      )}
    </div>
  );
}
