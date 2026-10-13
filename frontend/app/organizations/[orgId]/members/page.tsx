"use client";

import Sidebar from "@/components/sidebar/sidebar";
import Navbar from "@/components/navbar/Navbar";
import InviteMemberDialog from "@/components/organizations/InviteMemberDialog";
import PermissionGate from "@/components/auth/PermissionGate";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import OrgRoleSelect from "@/components/rbac/OrgRoleSelect";
import MemberPermissionsDialog from "@/components/rbac/MemberPermissionsDialog";
import MemberResourcePlanningDialog from "@/components/members/MemberResourcePlanningDialog";
import UserAvatar from "@/components/ui/UserAvatar";
import { usePresence } from "@/components/context/PresenceProvider";
import { STATUS_META } from "@/lib/presence";
import {
  ArrowLeft,
  MoreHorizontal,
  UserMinus,
  UserX,
  Crown,
  Shield,
  Mail,
  RefreshCw,
  Clock,
} from "lucide-react";

type OrgMember = {
  user: { _id: string; username: string; email: string; avatarColor?: string };
  role: string;
};

type PendingInvitation = {
  _id: string;
  email: string;
  role: string;
  department?: string;
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

export default function OrganizationMembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { canInviteMembers, canManageMembers, canRemoveMember, canChangeRole, canViewAdmin, canUpdateOrg, role } =
    useOrgPermission();
  const isOwner = role === "owner";
  const { roles, getLabel } = useOrgRoles(orgId);
  const { getStatus } = usePresence();
  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [accessMember, setAccessMember] = useState<OrgMember | null>(null);
  const [resourceMember, setResourceMember] = useState<OrgMember | null>(null);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<OrgMember | null>(null);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const load = async () => {
    const orgRes = await authFetch(`/organizations/${orgId}`);
    if (!orgRes.ok) {
      router.push("/organizations");
      return;
    }
    const org = await orgRes.json();
    setOrgName(org.name);

    const [membersRes, invitesRes] = await Promise.all([
      authFetch(`/organizations/${orgId}/members`),
      authFetch(`/organizations/${orgId}/invitations`),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json());
    if (invitesRes.ok) setPendingInvites(await invitesRes.json());
    else setPendingInvites([]);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    load();
  }, [orgId, router]);

  const resendInvite = async (inviteId: string) => {
    setResendingId(inviteId);
    const res = await authFetch(`/organizations/${orgId}/invitations/${inviteId}/resend`, {
      method: "POST",
    });
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
    const res = await authFetch(`/organizations/${orgId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user._id !== memberId));
      toast.success("Member removed");
    } else {
      const data = await res.json();
      toast.error(data.message || "Failed to remove member");
    }
  };

  const changeRole = async (memberId: string, role: string) => {
    const res = await authFetch(`/organizations/${orgId}/members/${memberId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.user._id === memberId ? { ...m, role } : m))
      );
      toast.success("Role updated");
    } else {
      const data = await res.json();
      toast.error(data.message || "Failed to update role");
    }
  };

  const transferOwnership = async (member: OrgMember) => {
    const ok = await confirmDialog({
      title: `Transfer ownership to ${member.user.username}?`,
      description: `They will become the owner of ${orgName}. You will become an admin.`,
      confirmLabel: "Transfer ownership",
      variant: "danger",
    });
    if (!ok) return;

    const res = await authFetch(`/organizations/${orgId}/transfer-ownership`, {
      method: "PATCH",
      body: JSON.stringify({ newOwnerId: member.user._id }),
    });
    const data = await res.json();

    if (res.ok) {
      toast.success(data.message || "Ownership transferred");
      await load();
    } else {
      toast.error(data.message || "Failed to transfer ownership");
    }
  };

  const deleteMemberAccount = async () => {
    if (!deleteAccountTarget) return;
    if (deleteAccountConfirmText !== deleteAccountTarget.user.username) return;

    setDeletingAccount(true);
    const res = await authFetch(
      `/organizations/${orgId}/members/${deleteAccountTarget.user._id}/account`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    setDeletingAccount(false);

    if (res.ok) {
      setMembers((prev) =>
        prev.filter((m) => m.user._id !== deleteAccountTarget.user._id)
      );
      setDeleteAccountTarget(null);
      setDeleteAccountConfirmText("");
    } else {
      alert(data.message || "Failed to delete account");
    }
  };

  const totalCount = members.length + pendingInvites.length;

  return (
    <PermissionGate permission="org:read">
      <div
        className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]"
        onClick={() => setOpenMenuId(null)}
      >
        <Navbar />
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-[#0B1120] dark:text-slate-100">
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-2 text-sm text-cyan-700/80 hover:text-cyan-600 mb-6 dark:text-cyan-400/80 dark:hover:text-cyan-300"
            >
              <ArrowLeft size={16} />
              Back to Organization Settings
            </Link>

            <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
              <div>
                <h1 className="text-4xl font-bold">
                  {orgName || "Organization"} Members
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Invite members by email and assign roles</p>
              </div>
              {canInviteMembers && (
                <InviteMemberDialog orgId={orgId} orgName={orgName} onInvited={load} />
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <h2 className="text-lg font-semibold mb-4">
                Members ({totalCount})
                {pendingInvites.length > 0 && (
                  <span className="ml-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    · {pendingInvites.length} pending
                  </span>
                )}
              </h2>
              <div className="space-y-3">
                {members.map((m) => (
                  <div
                    key={m.user._id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-cyan-200 transition dark:bg-slate-800/50 dark:border-slate-700 dark:hover:border-cyan-500/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={m.user.username}
                        color={m.user.avatarColor}
                        seed={m.user._id}
                        size={40}
                        userId={m.user._id}
                        showStatus
                      />
                      <div className="min-w-0">
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/organizations/${orgId}/members/${m.user._id}`)
                            }
                            className="font-medium truncate text-left hover:text-cyan-600 hover:underline dark:hover:text-cyan-400"
                            title="View member report"
                          >
                            {m.user.username}
                          </button>
                        ) : (
                          <p className="font-medium truncate">{m.user.username}</p>
                        )}
                        <p className="text-slate-500 text-sm truncate dark:text-slate-400">
                          {m.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(() => {
                        const status = getStatus(m.user._id);
                        const meta = status ? STATUS_META[status] : null;
                        return (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            <span
                              className={`h-2 w-2 rounded-full ${meta?.dotClass || "bg-slate-300 dark:bg-slate-600"}`}
                            />
                            {meta?.label || "Loading..."}
                          </span>
                        );
                      })()}
                      {canManageMembers && m.role !== "owner" ? (
                        <OrgRoleSelect
                          roles={roles}
                          value={m.role}
                          onChange={(nextRole) => changeRole(m.user._id, nextRole)}
                          label=""
                          triggerClassName={(open) =>
                            `flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg bg-white border outline-none transition-all cursor-pointer text-slate-900 dark:bg-slate-800 dark:text-slate-100 ${
                              open
                                ? "border-cyan-400 ring-4 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
                                : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                            }`
                          }
                          menuClassName="min-w-[160px]"
                        />
                      ) : (
                        <span className="text-sm text-cyan-700 px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-lg dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-500/30">
                          {getLabel(m.role)}
                        </span>
                      )}
                      {canUpdateOrg && (
                        <button
                          type="button"
                          onClick={() => setResourceMember(m)}
                          title="Resource planning settings"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors dark:text-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                        >
                          <Clock size={14} />
                          Capacity
                        </button>
                      )}
                      {canViewAdmin && m.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => setAccessMember(m)}
                          title="Customize this member's org/project permissions"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-700 border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 transition-colors dark:text-cyan-400 dark:border-cyan-500/30 dark:bg-cyan-400/10 dark:hover:bg-cyan-400/20"
                        >
                          <Shield size={13} /> Edit access
                        </button>
                      )}
                      {m.role !== "owner" &&
                        (canRemoveMember || isOwner) && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === m.user._id ? null : m.user._id);
                              }}
                              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                              aria-label="Member actions"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {openMenuId === m.user._id && (
                              <div
                                className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 w-48 dark:bg-slate-900 dark:border-slate-800"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {canRemoveMember && (
                                  <button
                                    onClick={() => { removeMember(m.user._id); setOpenMenuId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-500/10"
                                  >
                                    <UserMinus size={14} /> Remove
                                  </button>
                                )}
                                {isOwner && (
                                  <button
                                    onClick={() => { setDeleteAccountTarget(m); setOpenMenuId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors dark:text-red-300 dark:hover:bg-red-500/20"
                                  >
                                    <UserX size={14} /> Delete Account
                                  </button>
                                )}
                                {isOwner && (
                                  <button
                                    onClick={() => { transferOwnership(m); setOpenMenuId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors dark:text-amber-400 dark:hover:bg-amber-500/10"
                                  >
                                    <Crown size={14} /> Make owner
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {pendingInvites.map((invite) => {
                  const displayName = invite.user?.username || invite.email.split("@")[0];
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
                          {getLabel(invite.role)}
                        </span>
                        {canInviteMembers && (
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
                            {resendingId === invite._id ? "Sending..." : "Resend email"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {members.length === 0 && pendingInvites.length === 0 && (
                  <p className="text-sm text-slate-500 py-6 text-center dark:text-slate-400">
                    No members yet. Invite someone to get started.
                  </p>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {resourceMember && (
        <MemberResourcePlanningDialog
          orgId={orgId}
          memberId={resourceMember.user._id}
          memberName={resourceMember.user.username}
          onClose={() => setResourceMember(null)}
        />
      )}

      {accessMember && (
        <MemberPermissionsDialog
          orgId={orgId}
          memberId={accessMember.user._id}
          memberName={accessMember.user.username}
          roles={roles}
          onClose={() => setAccessMember(null)}
          onSaved={load}
        />
      )}

      {deleteAccountTarget && (
        <ModalShell
          onClose={() => { setDeleteAccountTarget(null); setDeleteAccountConfirmText(""); }}
        >
          <div className="p-6">
            <ModalHeader
              title="Delete Account"
              onClose={() => { setDeleteAccountTarget(null); setDeleteAccountConfirmText(""); }}
            />
            <div className="space-y-5">
              <div className="flex items-center gap-4 bg-red-50 border border-red-200 p-4 rounded-2xl dark:bg-red-500/10 dark:border-red-500/20">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base ring-2 ring-white shrink-0 dark:ring-slate-900 ${
                    deleteAccountTarget.user.avatarColor
                      ? ""
                      : "bg-gradient-to-br from-cyan-400 to-purple-500"
                  }`}
                  style={
                    deleteAccountTarget.user.avatarColor
                      ? { background: deleteAccountTarget.user.avatarColor }
                      : undefined
                  }
                >
                  {avatarInitials(deleteAccountTarget.user.username)}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {deleteAccountTarget.user.username}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {deleteAccountTarget.user.email}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This permanently deletes{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {deleteAccountTarget.user.username}
                </span>
                &apos;s entire account — not just their access to this organization. They will
                lose access to every organization and project they belong to, and will need to
                sign up again to use WriTask. This cannot be undone.
              </p>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 dark:text-slate-400">
                  Type{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {deleteAccountTarget.user.username}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  autoFocus
                  value={deleteAccountConfirmText}
                  onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                  className="field-input"
                  placeholder={deleteAccountTarget.user.username}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setDeleteAccountTarget(null); setDeleteAccountConfirmText(""); }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteMemberAccount}
                  disabled={
                    deletingAccount ||
                    deleteAccountConfirmText !== deleteAccountTarget.user.username
                  }
                  className="btn btn-danger flex-1 disabled:opacity-50"
                >
                  {deletingAccount ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
    </PermissionGate>
  );
}
