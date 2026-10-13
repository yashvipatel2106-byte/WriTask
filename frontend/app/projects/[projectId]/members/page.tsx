"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import ProjectInviteDialog from "@/components/projects/ProjectInviteDialog";
import { authFetch } from "@/lib/validation/authFetch";
import { useRole } from "@/hooks/useRole";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { projectRoleToOrgRole } from "@/lib/rbac";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Users, Mail, RefreshCw } from "lucide-react";

type Member = {
  user: { _id: string; username: string; email: string; avatarColor?: string };
  role: string;
  orgRole?: string;
};

type PendingInvitation = {
  _id: string;
  email: string;
  role: string;
  orgRole?: string | null;
  status: "pending";
  expiresAt: string;
  createdAt: string;
  user: {
    _id: string;
    username: string;
    email: string;
    avatarColor?: string;
  } | null;
};

function avatarInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function MembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { role: myRole, can } = useRole(projectId);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { getLabel } = useOrgRoles(organizationId);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    const projectRes = await authFetch(`/projects/${projectId}`);
    if (projectRes.status === 401 || projectRes.status === 403) {
      router.push("/projects");
      return;
    }
    if (projectRes.ok) {
      const p = await projectRes.json();
      setProjectName(p.title);
      const orgId = p.organization?._id || p.organization || null;
      setOrganizationId(orgId);
    }

    const [membersRes, invitesRes] = await Promise.all([
      authFetch(`/projects/${projectId}/members`),
      authFetch(`/projects/${projectId}/invitations`),
    ]);
    if (membersRes.ok) {
      const rows = await membersRes.json();
      setMembers(
        (Array.isArray(rows) ? rows : []).filter(
          (m: Member) => m?.user && m.user._id
        )
      );
    }
    if (invitesRes.ok) setPendingInvites(await invitesRes.json());
    else setPendingInvites([]);

    setLoading(false);
  }, [projectId, router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    load();
  }, [load, router]);

  const resendInvite = async (inviteId: string) => {
    setResendingId(inviteId);
    const res = await authFetch(
      `/projects/${projectId}/invitations/${inviteId}/resend`,
      { method: "POST" }
    );
    const data = await res.json().catch(() => ({}));
    setResendingId(null);

    if (res.ok) {
      toast.success(data.message || "Invitation resent");
      await load();
    } else {
      toast.error(data.message || "Failed to resend invitation");
    }
  };

  const removeMember = async (memberId: string) => {
    const ok = await confirmDialog({
      title: "Remove member from project?",
      description: "They will lose access to this project.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    const res = await authFetch(`/projects/${projectId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user._id !== memberId));
      toast.success("Member removed from project");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.message || "Failed to remove member");
    }
  };

  const totalCount = members.length + pendingInvites.length;

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-slate-950 dark:text-slate-100">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-cyan-700/80 hover:text-cyan-600 mb-6 dark:text-cyan-400/80 dark:hover:text-cyan-300"
          >
            <ArrowLeft size={16} />
            Back to board
          </Link>

          <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center dark:bg-cyan-400/10 dark:border-cyan-400/20">
                  <Users size={18} className="text-cyan-600 dark:text-cyan-400" />
                </div>
                <h1 className="text-3xl font-bold">
                  {projectName || "Project"} Members
                </h1>
              </div>
              <p className="text-slate-500 text-sm dark:text-slate-400">
                View project members and invite teammates. Pending invitees cannot
                be assigned tasks until they accept. Your role:{" "}
                <span className="text-cyan-700 font-medium dark:text-cyan-400">
                  {getLabel(projectRoleToOrgRole(myRole || ""))}
                </span>
                . Change roles from Organization Members.
              </p>
            </div>
            {can("member:invite") && (
              <ProjectInviteDialog
                projectId={projectId}
                projectName={projectName}
                organizationId={organizationId}
                onInvited={load}
              />
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-lg font-semibold mb-4">
              Team ({totalCount})
              {pendingInvites.length > 0 && (
                <span className="ml-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                  · {pendingInvites.length} pending
                </span>
              )}
            </h2>

            {loading ? (
              <p className="text-slate-500 text-center py-12 dark:text-slate-400">
                Loading members...
              </p>
            ) : members.length === 0 && pendingInvites.length === 0 ? (
              <p className="text-slate-500 text-center py-12 dark:text-slate-400">
                No members yet. Invite someone to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((m) => {
                  if (!m?.user?._id) return null;
                  const displayRoleId = m.orgRole || projectRoleToOrgRole(m.role);
                  return (
                    <div
                      key={m.user._id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-cyan-200 transition dark:bg-slate-800/50 dark:border-slate-700 dark:hover:border-cyan-500/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                            m.user.avatarColor ? "" : "bg-gradient-to-br from-cyan-400 to-purple-500"
                          }`}
                          style={m.user.avatarColor ? { background: m.user.avatarColor } : undefined}
                        >
                          {avatarInitials(m.user.username || "?")}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{m.user.username || "Unknown user"}</p>
                          <p className="text-slate-500 text-sm truncate dark:text-slate-400">
                            {m.user.email || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                          Active
                        </span>
                        <span className="text-sm text-cyan-700 px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-lg dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-500/30">
                          {getLabel(displayRoleId)}
                        </span>

                        {can("member:remove") && m.role !== "owner" && (
                          <button
                            onClick={() => removeMember(m.user._id)}
                            className="text-red-500 text-sm px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition dark:bg-red-500/10 dark:border-red-500/30 dark:hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {pendingInvites.map((invite) => {
                  const displayName =
                    invite.user?.username || invite.email.split("@")[0];
                  const displayRoleId =
                    invite.orgRole || projectRoleToOrgRole(invite.role);
                  return (
                    <div
                      key={invite._id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 bg-amber-50/40 rounded-xl border border-amber-200/80 dark:bg-amber-500/5 dark:border-amber-500/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                            invite.user?.avatarColor
                              ? ""
                              : "bg-gradient-to-br from-amber-400 to-orange-500"
                          }`}
                          style={
                            invite.user?.avatarColor
                              ? { background: invite.user.avatarColor }
                              : undefined
                          }
                        >
                          {avatarInitials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{displayName}</p>
                          <p className="text-slate-500 text-sm truncate dark:text-slate-400">
                            {invite.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                          Pending
                        </span>
                        <span className="text-sm text-slate-600 px-3 py-1.5 bg-white border border-slate-200 rounded-lg dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700">
                          {getLabel(displayRoleId)}
                        </span>
                        {can("member:invite") && (
                          <button
                            type="button"
                            onClick={() => resendInvite(invite._id)}
                            disabled={resendingId === invite._id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-700 border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-50 dark:text-cyan-400 dark:border-cyan-500/30 dark:bg-cyan-400/10 dark:hover:bg-cyan-400/20"
                          >
                            {resendingId === invite._id ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <Mail size={13} />
                            )}
                            {resendingId === invite._id
                              ? "Sending..."
                              : "Resend email"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
