"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/validation/authFetch";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import {
  UserPlus, Search, Pencil, Trash2, X, Check,
  ChevronDown, MoreHorizontal, Mail, Phone,
  MapPin, Shield, Briefcase, Eye,
  Users, Filter, Download, RefreshCw, UserX,
} from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import OrgRoleSelect from "@/components/rbac/OrgRoleSelect";
import CreateRoleDialog from "@/components/rbac/CreateRoleDialog";
import MemberPermissionsDialog from "@/components/rbac/MemberPermissionsDialog";
import { getEmailValidationError, isValidInviteEmail } from "@/lib/validation/email";
import { DEPARTMENT_OPTIONS } from "@/lib/constants/departments";
type Status = "Active" | "Idle" | "Offline";
type Member = {
  _id: string;
  username: string;
  email: string;
  avatarColor?: string;
  role: string;
  status: Status;
  designation: string;
  department: string;
  location: string;
  phone: string;
  verified: boolean;
  createdAt: string;
};

// ── constants ──────────────────────────────────────────────────────────────
const STATUS_OPTIONS: Status[] = ["Active", "Idle", "Offline"];

const STATUS_CONFIG: Record<Status, { dot: string; text: string; glow: string }> = {
  Active:  { dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400", glow: "shadow-[0_0_6px_rgba(52,211,153,0.8)]"  },
  Idle:    { dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",   glow: "shadow-[0_0_6px_rgba(251,191,36,0.7)]"  },
  Offline: { dot: "bg-slate-300 dark:bg-slate-600",   text: "text-slate-400 dark:text-slate-500",   glow: ""                                        },
};

const AVATAR_COLORS = [
  "from-violet-600 to-violet-800", "from-cyan-600 to-cyan-800",
  "from-blue-600 to-blue-800",     "from-pink-600 to-pink-800",
  "from-emerald-600 to-emerald-800","from-amber-600 to-amber-800",
];

// ── seed data (replaced by real API when backend is running) ───────────────

// ── helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
function avatarColor(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length];
}

function orgMemberToMember(om: {
  user?: {
    _id: string;
    username: string;
    email: string;
    avatarColor?: string;
    designation?: string;
    department?: string;
  } | null;
  role: string;
  department?: string;
  joinedAt?: string;
}): Member | null {
  if (!om?.user?._id) return null;
  return normalizeMember({
    _id: om.user._id,
    username: om.user.username,
    email: om.user.email,
    avatarColor: om.user.avatarColor,
    role: om.role,
    status: "Active",
    designation: om.user.designation || "",
    department: om.department || om.user.department || "",
    location: "",
    phone: "",
    verified: true,
    createdAt: om.joinedAt || new Date().toISOString(),
  });
}

function normalizeMember(member: Partial<Member>): Member {
  return {
    _id: member._id || "",
    username: member.username || "",
    email: member.email || "",
    avatarColor: member.avatarColor,
    role: member.role || "developer",
    status: member.status || "Active",
    designation: member.designation || "",
    department: member.department || "",
    location: member.location || "",
    phone: member.phone || "",
    verified: Boolean(member.verified),
    createdAt: member.createdAt || "",
  };
}

// ── sub-components ─────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <ModalShell onClose={onClose} maxWidth="lg" className="max-h-[90vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0 dark:border-slate-800"  >
       <ModalHeader title={title} subtitle={subtitle} onClose={onClose} className="mb-0" />

      </div>
      <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 shrink-0 dark:border-slate-800 dark:bg-slate-800/60">
          {footer}
        </div>
      )}
    </ModalShell>
  );
}

const inputCls = "field-input";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 dark:text-slate-400">
      {children}
    </label>
  );
}

// ── member form ────────────────────────────────────────────────────────────
function MemberForm({
  initial, onSave, onCancel, roles, orgId, canCreateRole, onRolesChange, canEditAccess,
}: {
  initial?: Partial<Member>;
  onSave: (d: any) => void;
  onCancel: () => void;
  roles: ReturnType<typeof useOrgRoles>["roles"];
  orgId?: string;
  canCreateRole?: boolean;
  onRolesChange?: () => void;
  /** Show the "Edit access" trigger beside the role dropdown — only
   * meaningful when editing an existing member (needs a real member id). */
  canEditAccess?: boolean;
}) {
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [form, setForm] = useState({
    username:    initial?.username    || "",
    email:       initial?.email       || "",
    role:        initial?.role        || "developer",
    status:      initial?.status      || "Active" as Status,
    designation: initial?.designation || "",
    department:  initial?.department  || "Engineering",
    location:    initial?.location    || "",
    phone:       initial?.phone       || "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid =
    form.username.trim() &&
    form.email.trim() &&
    isValidInviteEmail(form.email);

  const handleSave = () => {
    const validationError = getEmailValidationError(form.email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    if (!valid) return;
    onSave(form);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Full Name *</Label>
          <input className={inputCls} placeholder="John Doe" value={form.username} onChange={e => set("username", e.target.value)} />
        </div>
        <div>
          <Label>Email *</Label>
          <input
            type="email"
            className={`${inputCls} ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100" : ""}`}
            placeholder="john@acme.com"
            value={form.email}
            onChange={(e) => {
              set("email", e.target.value);
              if (emailError) setEmailError("");
            }}
            onBlur={() => {
              if (form.email.trim()) {
                setEmailError(getEmailValidationError(form.email) || "");
              }
            }}
            autoComplete="email"
          />
          {emailError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{emailError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex-1">
              <OrgRoleSelect
                roles={roles}
                value={form.role}
                onChange={(role) => set("role", role)}
                canCreateRole={canCreateRole}
                onRequestCreateRole={() => setCreateRoleOpen(true)}
              />
            </div>
            {canEditAccess && initial?._id && (
              <button
                type="button"
                onClick={() => setAccessOpen(true)}
                title="Customize this member's org/project permissions"
                className="mt-6 shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-cyan-700 border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 transition-colors dark:text-cyan-400 dark:border-cyan-500/30 dark:bg-cyan-400/10 dark:hover:bg-cyan-400/20"
              >
                <Shield size={13} /> Edit access
              </button>
            )}
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={form.status}
            onChange={(v) => set("status", v)}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            className="w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Designation</Label>
          <input className={inputCls} placeholder="e.g. Senior Engineer" value={form.designation} onChange={e => set("designation", e.target.value)} />
        </div>
        <div>
          <Label>Department</Label>
          <Select
            value={form.department}
            onChange={(v) => set("department", v)}
            options={DEPARTMENT_OPTIONS.map((d) => ({ value: d, label: d }))}
            className="w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Location</Label>
          <input className={inputCls} placeholder="City, Country" value={form.location} onChange={e => set("location", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <input className={inputCls} placeholder="+1 555 000 0000" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="btn btn-secondary flex-1"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!valid}
          className="btn btn-primary flex-1"
        >
          {initial?._id ? "Save changes" : "Add member"}
        </button>
      </div>

      {orgId && (
        <CreateRoleDialog
          orgId={orgId}
          open={createRoleOpen}
          onClose={() => setCreateRoleOpen(false)}
          roles={roles}
          onCreated={(created) => {
            set("role", created.id);
            onRolesChange?.();
          }}
        />
      )}

      {accessOpen && orgId && initial?._id && (
        <MemberPermissionsDialog
          orgId={orgId}
          memberId={initial._id}
          memberName={initial.username || "Member"}
          roles={roles}
          onClose={() => setAccessOpen(false)}
        />
      )}
    </div>
  );
}

// ── member detail drawer ───────────────────────────────────────────────────
function MemberDetail({ member, onClose, onEdit, roleLabel }: {
  member: Member; onClose: () => void; onEdit: () => void; roleLabel: string;
}) {
  const statusCfg = STATUS_CONFIG[member.status];

  return (
    <div className="space-y-5">
      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold ring-4 ring-slate-100 dark:ring-slate-800 ${
            member.avatarColor ? "" : `bg-gradient-to-br ${avatarColor(member.username)}`
          }`}
          style={member.avatarColor ? { background: member.avatarColor } : undefined}
        >
          {getInitials(member.username)}
        </div>
        <div>
          <h3 className="text-slate-900 text-xl font-bold dark:text-slate-100">{member.username}</h3>
          <p className="text-slate-500 text-sm dark:text-slate-400">{member.designation || "No designation"}</p>
        </div>
        <div className="flex gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700">
            <Shield size={11} /> {roleLabel}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 ${statusCfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${statusCfg.glow}`} />
            {member.status}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3 dark:bg-slate-800">
        {[
          { icon: Mail,    value: member.email,      label: "Email"      },
          { icon: Phone,   value: member.phone,      label: "Phone"      },
          { icon: MapPin,  value: member.location,   label: "Location"   },
          { icon: Briefcase, value: member.department, label: "Department" },
        ].map(row => row.value ? (
          <div key={row.label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0 dark:bg-cyan-400/10">
              <row.icon size={14} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.label}</p>
              <p className="text-slate-800 text-sm font-medium dark:text-slate-100">{row.value}</p>
            </div>
          </div>
        ) : null)}
      </div>

      {/* Meta */}
      <div className="flex justify-between text-xs text-slate-400 px-1 dark:text-slate-500">
        <span>Joined {new Date(member.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}</span>
        <span className={member.verified ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
          {member.verified ? "✓ Verified" : "⚠ Unverified"}
        </span>
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="btn btn-secondary flex-1">
          Close
        </button>
        <button onClick={onEdit} className="btn btn-primary flex-1">
          Edit Member
        </button>
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
function MembersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOrg } = useOrganization();
  const { canViewAdmin } = useOrgPermission();
  const {
    roles: orgRoles,
    loadRoles,
    getLabel,
  } = useOrgRoles(currentOrg?.organizationId);
  const roles = orgRoles;

  const [members, setMembers] = useState<Member[]>([]);

  const [stats, setStats] = useState({
  total: 0,
  active: 0,
  departments: 0,
  verified: 0,
});

  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptFilter, setDeptFilter]   = useState("All");

  
  const [showAdd, setShowAdd]         = useState(false);
  const [editMember, setEditMember]   = useState<Member | null>(null);
  const [viewMember, setViewMember]   = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<Member | null>(null);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [actionMenu, setActionMenu]   = useState<string | null>(null);
  const [toast, setToast]             = useState<string | null>(null);
  

  // ── data fetching ────────────────────────────────────────────────────────
 useEffect(() => {
  const q = searchParams.get("q");
  if (q) setSearch(q);
}, [searchParams]);

 useEffect(() => {
  fetchMembers();
}, [currentOrg?.organizationId]);

useEffect(() => {
  const departments = new Set(members.map((m) => m.department).filter(Boolean));
  setStats({
    total: members.length,
    active: members.filter((m) => m.status === "Active").length,
    departments: departments.size,
    verified: members.filter((m) => m.verified).length,
  });
}, [members]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

const fetchMembers = async () => {
  setLoading(true);
  const orgId = currentOrg?.organizationId;

  try {
    if (orgId) {
      const res = await authFetch(`/organizations/${orgId}/members`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to fetch members (${res.status})`);
      }

      const data = await res.json();
      setMembers(
        Array.isArray(data)
          ? data
              .map(orgMemberToMember)
              .filter((m): m is Member => m !== null)
          : []
      );
    } else {
      const res = await authFetch("/members");

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to fetch members (${res.status})`);
      }

      const data = await res.json();
      setMembers(
        Array.isArray(data) ? data.map((m: Partial<Member>) => normalizeMember(m)) : []
      );
    }
  } catch (error) {
    console.error("Members fetch error:", error);
    setMembers([]);
    showToast(
      error instanceof Error ? error.message : "Failed to load members"
    );
  } finally {
    setLoading(false);
  }
};

const handleRefresh = () => {
  fetchMembers();
};


  // ── CRUD ─────────────────────────────────────────────────────────────────

  const handleAdd = async (data: any) => {
    const emailValidationError = getEmailValidationError(data.email);
    if (emailValidationError) {
      showToast(emailValidationError);
      return;
    }

    const orgId = currentOrg?.organizationId;

    try {
      if (orgId) {
        const res = await authFetch(`/organizations/${orgId}/invite`, {
          method: "POST",
          body: JSON.stringify({
            email: data.email.trim().toLowerCase(),
            role: data.role,
            department: data.department,
          }),
        });
        if (res.ok) {
          showToast(`Invitation sent to ${data.email}`);
          setShowAdd(false);
          fetchMembers();
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.message || "Failed to invite member");
        }
      } else {
        const res = await authFetch("/members", {
          method: "POST",
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const newMember = await res.json();
          setMembers((p) => [normalizeMember(newMember), ...p]);
          setShowAdd(false);
          showToast(`${data.username || data.email} added`);
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.message || "Failed to add member");
        }
      }
    } catch {
      showToast("Failed to add member");
    }
  };

  const handleEdit = async (data: any) => {
    if (!editMember) return;
    const orgId = currentOrg?.organizationId;

    try {
      if (orgId) {
        if (data.role !== editMember.role) {
          const res = await authFetch(
            `/organizations/${orgId}/members/${editMember._id}/role`,
            {
              method: "PATCH",
              body: JSON.stringify({ role: data.role }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Role update failed");
          }
        }
        setMembers((p) =>
          p.map((m) =>
            m._id === editMember._id ? normalizeMember({ ...m, ...data }) : m
          )
        );
      } else {
        const res = await authFetch(`/members/${editMember._id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Update failed");
        }
        const updated = await res.json();
        setMembers((p) =>
          p.map((m) =>
            m._id === editMember._id ? normalizeMember(updated) : m
          )
        );
      }
      setEditMember(null);
      showToast("Member updated");
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : "Failed to update member"
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const orgId = currentOrg?.organizationId;

    try {
      if (orgId) {
        const res = await authFetch(
          `/organizations/${orgId}/members/${deleteTarget._id}`,
          {
            method: "DELETE",
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Delete failed");
        }
      } else {
        const res = await authFetch(`/members/${deleteTarget._id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Delete failed");
        }
      }

      setMembers((prev) =>
        prev.filter((member) => member._id !== deleteTarget._id)
      );

      showToast(`${deleteTarget.username} removed`);
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : "Failed to remove member"
      );
    }

    setDeleteTarget(null);
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    if (deleteAccountConfirmText !== deleteAccountTarget.username) return;
    const orgId = currentOrg?.organizationId;
    if (!orgId) {
      showToast("Account deletion is only available inside an organization");
      setDeleteAccountTarget(null);
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await authFetch(
        `/organizations/${orgId}/members/${deleteAccountTarget._id}/account`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete account");
      }

      setMembers((prev) =>
        prev.filter((member) => member._id !== deleteAccountTarget._id)
      );
      showToast(`${deleteAccountTarget.username}'s account was permanently deleted`);
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error ? error.message : "Failed to delete account"
      );
    } finally {
      setDeletingAccount(false);
      setDeleteAccountTarget(null);
      setDeleteAccountConfirmText("");
    }
  };

  const handleExport = () => {
    const rows = [
      ["Name", "Email", "Role", "Status", "Designation", "Department", "Location"],
      ...members.map(m => [m.username, m.email, m.role, m.status, m.designation, m.department, m.location]),
    ];
    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "members.csv"; a.click();
  };

  // ── filtering ─────────────────────────────────────────────────────────────
  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const username = m.username.toLowerCase();
    const email = m.email.toLowerCase();
    const designation = m.designation.toLowerCase();
    return (
      (username.includes(q) || email.includes(q) || designation.includes(q)) &&
      (roleFilter   === "All" || m.role       === roleFilter)   &&
      (statusFilter === "All" || m.status     === statusFilter) &&
      (deptFilter   === "All" || m.department === deptFilter)
    );
  });

  // ── stats ─────────────────────────────────────────────────────────────────


  // ── departments list for filter ───────────────────────────────────────────
  const deptOptions = ["All", ...Array.from(new Set(members.map(m => m.department).filter(Boolean)))];

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120]" onClick={() => setActionMenu(null)}>
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">

          {/* Toast */}
          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 text-slate-900 text-sm px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 pointer-events-none dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100">
              <Check size={14} className="text-cyan-600 dark:text-cyan-400" /> {toast}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Team Members</h1>
              <p className="text-slate-500 mt-1 dark:text-slate-400">Manage your workspace team, roles, and access
                {currentOrg ? ` in ${currentOrg.name}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl transition text-sm font-medium dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl transition text-sm font-medium dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300"
              >
                <Download size={14} /> Export
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-[#020B2A] font-semibold px-5 py-2.5 rounded-xl transition shadow-lg shadow-cyan-500/20 text-sm"
              >
                <UserPlus size={16} /> Add Member
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            {[
              { label: "Total Members",  value: stats.total,       color: "text-slate-900 dark:text-slate-100"    },
              { label: "Active Now",     value: stats.active,      color: "text-emerald-600 dark:text-emerald-400"  },
              { label: "Departments",    value: stats.departments,  color: "text-cyan-600 dark:text-cyan-400"     },
              { label: "Verified",       value: stats.verified,     color: "text-violet-600 dark:text-violet-400"   },
            ].map(s => (
              <div key={s.label} className="dashboard-card">
                <p className="text-slate-500 mb-2 dark:text-slate-400">{s.label}</p>
                <h2 className={`text-4xl font-bold ${s.color}`}>{s.value}</h2>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500" />
              <input
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 text-sm transition dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-cyan-500/20"
                placeholder="Search name, email, designation…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Role filter */}
            <div className="relative">
              <Filter size={12} className="absolute left-3.5 top-3.5 text-slate-400 dark:text-slate-500" />
              <select
                className="pl-9 pr-8 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:focus:ring-cyan-500/20"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
              >
                <option value="All">All Roles</option>
                {roles
                  .filter((role) => role.id !== "owner")
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none dark:text-slate-500" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                className="px-4 pr-8 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:focus:ring-cyan-500/20"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Status</option>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none dark:text-slate-500" />
            </div>

            {/* Department filter */}
            <div className="relative">
              <select
                className="px-4 pr-8 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:focus:ring-cyan-500/20"
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
              >
                {deptOptions.map(d => <option key={d} value={d}>{d === "All" ? "All Depts" : d}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none dark:text-slate-500" />
            </div>
          </div>

          {/* Table */}
          <div className="dashboard-widget overflow-hidden !p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
                  {["Member", "Role", "Department", "Status", "Contact", "Joined", ""].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider first:pl-5 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-500 dark:text-slate-400">
                      <RefreshCw size={28} className="mx-auto mb-3 animate-spin opacity-30" />
                      <p className="text-sm">Loading members…</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400 dark:text-slate-500">
                      <Users size={36} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">
                        {search || roleFilter !== "All" || statusFilter !== "All" || deptFilter !== "All"
                          ? "No members match your filters"
                          : "No members yet — add your first team member"}
                      </p>
                      {(search || roleFilter !== "All" || statusFilter !== "All" || deptFilter !== "All") && (
                        <button
                          onClick={() => { setSearch(""); setRoleFilter("All"); setStatusFilter("All"); setDeptFilter("All"); }}
                          className="mt-3 text-cyan-600 hover:text-cyan-700 text-xs font-medium transition-colors dark:text-cyan-400 dark:hover:text-cyan-300"
                        >
                          Clear all filters
                        </button>
                      )}
                    </td>
                  </tr>
                )
                 : filtered.map(member => {
                  const roleLabel = getLabel(member.role);
                  const statusCfg = STATUS_CONFIG[member.status];

                  return (
                    <tr
                      key={member._id}
                      className="hover:bg-slate-50 transition-colors group dark:hover:bg-slate-800"
                      onClick={() => setActionMenu(null)}
                    >
                      {/* Member */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-slate-100 shrink-0 dark:ring-slate-800 ${
                              member.avatarColor ? "" : `bg-gradient-to-br ${avatarColor(member.username)}`
                            }`}
                            style={member.avatarColor ? { background: member.avatarColor } : undefined}
                          >
                            {getInitials(member.username)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{member.username}</p>
                              {member.verified && (
                                <div className="w-3.5 h-3.5 rounded-full bg-cyan-100 flex items-center justify-center dark:bg-cyan-400/20" title="Verified">
                                  <Check size={8} className="text-cyan-700 dark:text-cyan-400" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <p className="text-slate-500 text-xs dark:text-slate-400">{member.designation || member.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700">
                          <Shield size={11} /> {roleLabel}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="px-5 py-4 text-slate-500 text-sm hidden lg:table-cell dark:text-slate-400">
                        {member.department || "—"}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 text-xs font-medium ${statusCfg.text}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot} ${statusCfg.glow}`} />
                          {member.status}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-4 hidden xl:table-cell">
                        <div className="space-y-0.5">
                          <a
                            href={`mailto:${member.email}`}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 transition-colors dark:text-slate-400 dark:hover:text-cyan-400"
                            onClick={e => e.stopPropagation()}
                          >
                            <Mail size={11} /> {member.email}
                          </a>
                          {member.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                              <Phone size={11} /> {member.phone}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-4 text-slate-500 text-xs hidden lg:table-cell dark:text-slate-400">
                        {new Date(member.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="relative flex justify-end">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActionMenu(actionMenu === member._id ? null : member._id);
                            }}
                            className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {actionMenu === member._id && (
                            <div
                              className="absolute right-0 top-9 z-20 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 w-44 dark:bg-slate-900 dark:border-slate-800"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={() => { setViewMember(member); setActionMenu(null); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 transition-colors dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
                              >
                                <Eye size={13} /> View Profile
                              </button>
                              <button
                                onClick={() => { setEditMember(member); setActionMenu(null); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 transition-colors dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
                              >
                                <Pencil size={13} /> Edit Member
                              </button>
                              <div className="border-t border-slate-200 my-1 dark:border-slate-800" />
                              <button
                                onClick={() => { setDeleteTarget(member); setActionMenu(null); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-500/10"
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                              {currentOrg?.role === "owner" && member.role !== "owner" && (
                                <button
                                  onClick={() => { setDeleteAccountTarget(member); setActionMenu(null); }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors dark:text-red-300 dark:hover:bg-red-500/20"
                                >
                                  <UserX size={13} /> Delete Account
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
                }
              </tbody>
            </table>
            </div>

            {/* Table footer */}
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span>{filtered.length} of {members.length} member{members.length !== 1 ? "s" : ""}</span>
              {(search || roleFilter !== "All" || statusFilter !== "All" || deptFilter !== "All") && (
                <button
                  onClick={() => { setSearch(""); setRoleFilter("All"); setStatusFilter("All"); setDeptFilter("All"); }}
                  className="text-cyan-600 hover:text-cyan-700 font-medium transition-colors dark:text-cyan-400 dark:hover:text-cyan-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

        </main>
      </div>

      {/* ── Modals ── */}

      {showAdd && (
        <Modal title="Add New Member" onClose={() => setShowAdd(false)}>
          <MemberForm
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            roles={roles}
            orgId={currentOrg?.organizationId}
            canCreateRole={canViewAdmin && !!currentOrg}
            onRolesChange={() => void loadRoles()}
          />
        </Modal>
      )}

      {editMember && (
        <Modal title="Edit Member" onClose={() => setEditMember(null)}>
          <MemberForm
            initial={editMember}
            onSave={handleEdit}
            onCancel={() => setEditMember(null)}
            roles={roles}
            orgId={currentOrg?.organizationId}
            canCreateRole={canViewAdmin && !!currentOrg}
            onRolesChange={() => void loadRoles()}
            canEditAccess={canViewAdmin && !!currentOrg && editMember.role !== "owner"}
          />
        </Modal>
      )}

      {viewMember && (
        <Modal title="Member Profile" onClose={() => setViewMember(null)}>
          <MemberDetail
            member={viewMember}
            roleLabel={getLabel(viewMember.role)}
            onClose={() => setViewMember(null)}
            onEdit={() => { setEditMember(viewMember); setViewMember(null); }}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Remove Member" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4 bg-red-50 border border-red-200 p-4 rounded-2xl dark:bg-red-500/10 dark:border-red-500/20">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base ring-2 ring-white shrink-0 dark:ring-slate-900 ${
                  deleteTarget.avatarColor ? "" : `bg-gradient-to-br ${avatarColor(deleteTarget.username)}`
                }`}
                style={deleteTarget.avatarColor ? { background: deleteTarget.avatarColor } : undefined}
              >
                {getInitials(deleteTarget.username)}
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{deleteTarget.username}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{deleteTarget.email}</p>
                <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">{getLabel(deleteTarget.role)} · {deleteTarget.department}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Removing <span className="font-semibold text-slate-900 dark:text-slate-100">{deleteTarget.username}</span> will revoke all their workspace access. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleDelete} className="btn btn-danger flex-1">
                Remove Member
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteAccountTarget && (
        <Modal
          title="Delete Account"
          onClose={() => { setDeleteAccountTarget(null); setDeleteAccountConfirmText(""); }}
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4 bg-red-50 border border-red-200 p-4 rounded-2xl dark:bg-red-500/10 dark:border-red-500/20">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base ring-2 ring-white shrink-0 dark:ring-slate-900 ${
                  deleteAccountTarget.avatarColor
                    ? ""
                    : `bg-gradient-to-br ${avatarColor(deleteAccountTarget.username)}`
                }`}
                style={
                  deleteAccountTarget.avatarColor
                    ? { background: deleteAccountTarget.avatarColor }
                    : undefined
                }
              >
                {getInitials(deleteAccountTarget.username)}
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{deleteAccountTarget.username}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{deleteAccountTarget.email}</p>
                <p className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">{getLabel(deleteAccountTarget.role)} · {deleteAccountTarget.department}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This permanently deletes{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{deleteAccountTarget.username}</span>&apos;s
              entire account — not just their access to this workspace. They will lose access to
              every organization and project they belong to, and this cannot be undone.
            </p>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 dark:text-slate-400">
                Type <span className="font-semibold text-slate-700 dark:text-slate-300">{deleteAccountTarget.username}</span> to confirm
              </label>
              <input
                autoFocus
                value={deleteAccountConfirmText}
                onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                className="field-input"
                placeholder={deleteAccountTarget.username}
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
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteAccountConfirmText !== deleteAccountTarget.username}
                className="btn btn-danger flex-1 disabled:opacity-50"
              >
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center text-slate-400 dark:bg-[#0B1120] dark:text-slate-500">
          Loading members…
        </div>
      }
    >
      <MembersPageContent />
    </Suspense>
  );
}
