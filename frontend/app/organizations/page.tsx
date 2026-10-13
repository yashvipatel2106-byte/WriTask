"use client";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import InviteMemberDialog from "@/components/organizations/InviteMemberDialog";
import { useOrganization } from "@/components/context/organizationContext";
import { readStoredOrgId } from "@/lib/orgStorage";
import { authFetch } from "@/lib/validation/authFetch";
import { formatRoleLabel } from "@/lib/rbac";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function OrganizationsPage() {
  const router = useRouter();
  const { access, refreshAccess, setCurrentOrgId } = useOrganization();
  const { canCreateOrganization } = useOrgPermission();
  const [organizations, setOrganizations] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const load = async () => {
      const res = await authFetch("/organizations");
     if (res.ok) {
  const orgs = await res.json();

  setOrganizations(orgs);

  if (
    orgs.length > 0 &&
    !readStoredOrgId()
  ) {
    setCurrentOrgId(orgs[0]._id);
  }
}
    };
    load();
  }, [router]);

  const acceptInvite = async (token: string) => {
    const res = await authFetch("/organizations/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      await refreshAccess();
      toast.success(data.message || "Invitation accepted");
    } else {
      toast.error(data.message || "Unable to accept invitation");
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120]">
     <Navbar />

<div className="flex">
  <Sidebar />

  <main className="flex-1 ml-0 lg:ml-70 mt-16 h-[calc(100vh-64px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-[15px] dark:bg-[#0B1120] dark:text-slate-100">
        <div>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold">Organizations</h1>
              <p className="text-slate-500 dark:text-slate-400">
                Create workspaces
              </p>
            </div>
            {canCreateOrganization && (
            <Link
              href="/organizations/create"
              className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-5 py-3 rounded-xl"
            >
              + Create Organization
            </Link>
            )}
          </div>

          {access?.pendingInvitations && access.pendingInvitations.length > 0 && (
            <div className="bg-white border border-yellow-300 shadow-sm rounded-2xl p-6 mb-8 dark:bg-slate-900 dark:border-yellow-500/30">
              <h2 className="text-lg font-semibold mb-4">Pending Invitations</h2>
              <div className="space-y-3">
                {access.pendingInvitations.map((invite) => (
                  <div
                    key={invite._id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl dark:bg-slate-800"
                  >
                    <div>
                      <p className="font-medium">{invite.organization?.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                       Role: {formatRoleLabel(invite.role)}
                      </p>
                    </div>
                    <button
                      onClick={() => acceptInvite(invite.token)}
                      className="px-4 py-2 rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {organizations.map((org) => (
              <div
  key={org._id}
  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm p-6 transition-all duration-300 hover:border-cyan-300 hover:shadow-md hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-500/40"
>
  <div className="flex items-start justify-between mb-5">
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center text-2xl border border-cyan-200 dark:bg-cyan-400/10 dark:border-cyan-400/20">
        🏢
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {org.name}
        </h2>
      </div>
    </div>

    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
      Active
    </span>
  </div>

  <div className="flex items-center gap-3 mb-5">
    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white flex items-center justify-center font-bold">
      {formatRoleLabel(org.myRole)
        ?.charAt(0)
        ?.toUpperCase()}
    </div>

    <div>
      <p className="font-medium text-cyan-700 capitalize dark:text-cyan-400">
        {formatRoleLabel(org.myRole)}
      </p>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Workspace Access
      </p>
    </div>
  </div>

  <div className="mb-5">
    <div className="flex justify-between text-sm mb-2">
      <span className="text-slate-500 dark:text-slate-400">
        Workspace Health
      </span>

      <span className="text-cyan-700 font-medium dark:text-cyan-400">
        100%
      </span>
    </div>

    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
      <div className="h-full w-full bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full"></div>
    </div>
  </div>

  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">

  <button
  onClick={() => {
    setCurrentOrgId(org._id);
    router.push(`/organizations/${org._id}/members`);
  }}
  className="text-cyan-700 hover:text-cyan-600 transition font-medium dark:text-cyan-400 dark:hover:text-cyan-300"
>
  Manage Members →
</button>

  <div className="flex items-center gap-3">

    <button
      onClick={async () => {
        const ok = await confirmDialog({
          title: "Move organization to trash?",
          description: "You can restore it later from Trash.",
          confirmLabel: "Move to trash",
          variant: "danger",
        });
        if (!ok) return;

        try {
          const res = await authFetch(
            `/organizations/${org._id}/trash`,
            {
              method: "PATCH",
            }
          );

          const data = await res.json();

          if (!res.ok) {
            toast.error(data.message || "Failed to move organization to trash");
            return;
          }

          setOrganizations((prev) =>
            prev.filter((o) => o._id !== org._id)
          );

          toast.success("Organization moved to trash");
        } catch (err) {
          console.error(err);
          toast.error("Unable to delete organization. Please try again.");
        }
      }}
      className="px-3 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20"
    >
      Delete
    </button>

    <span className="text-xs text-slate-400 dark:text-slate-500">
      Workspace
    </span>

  </div>

</div>
</div>
            ))}
          </div>
        </div>
      </main>
    </div>
    </div>
  );
}
