"use client";

import { useEffect, useState } from "react";
import { Mail, UserPlus } from "lucide-react";
import { authFetch } from "@/lib/validation/authFetch";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import OrgRoleSelect from "@/components/rbac/OrgRoleSelect";
import CreateRoleDialog from "@/components/rbac/CreateRoleDialog";
import { orgRoleToProjectRole } from "@/lib/rbac";
import { getEmailValidationError } from "@/lib/validation/email";
import { confirmDialog } from "@/components/ui/confirm";

type Props = {
  projectId: string;
  projectName: string;
  organizationId?: string | null;
  onInvited?: () => void;
};

function isOrgMembershipRequiredError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("organization member") ||
    m.includes("organization member") ||
    m.includes("pending organization invitation") ||
    m.includes("pending organization invitation") ||
    m.includes("invite them to the organization ") ||
    m.includes("invite them to the organization")
  );
}

export default function ProjectInviteDialog({
  projectId,
  projectName,
  organizationId,
  onInvited,
}: Props) {
  const { canViewAdmin } = useOrgPermission();
  const { roles, loadRoles } = useOrgRoles(organizationId);
  const [open, setOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (!open || roles.length === 0) return;
    if (!roles.some((item) => item.id === role)) {
      setRole(roles.find((item) => item.id === "developer")?.id || roles[0].id);
    }
  }, [open, roles, role]);

  const submit = async () => {
    const validationError = getEmailValidationError(email);
    if (validationError) {
      setEmailError(validationError);
      setMessage("");
      return;
    }

    setLoading(true);
    setMessage("");
    setEmailError("");

    const projectRole = orgRoleToProjectRole(role, roles);
    const res = await authFetch(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        role: projectRole,
        orgRole: role,
      }),
    });
    const data = await res.json().catch(() => ({} as { message?: string }));
    setLoading(false);

    if (res.ok) {
      setMessage(data.message || "Invitation sent.");
      setEmail("");
      onInvited?.();
      setTimeout(() => setOpen(false), 2000);
      return;
    }

    const errorMessage =
      data.message ||
      "Failed to send invitation.";

    if (isOrgMembershipRequiredError(errorMessage)) {
      await confirmDialog({
        title: "Organization membership required",
        description:
          "To join this project, the user must already be an accepted organization member. Invite them to the organization first and wait until they accept — then invite them to the project.",
        confirmLabel: "Got it",
        cancelLabel: "Close",
        variant: "default",
      });
      return;
    }

    setMessage(errorMessage);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-secondary btn-sm">
        <UserPlus size={14} />
        Invite by Email
      </button>
    );
  }

  return (
    <>
      <ModalShell onClose={() => setOpen(false)} maxWidth="lg" className="overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0 dark:bg-cyan-400/10 dark:border-cyan-400/20">
              <UserPlus size={18} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <ModalHeader
                title={`Invite to ${projectName}`}
                subtitle="Choose an organization role. Project access follows that role's permissions."
                onClose={() => setOpen(false)}
                className="mb-0"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FormLabel>Email address</FormLabel>
            <div className="relative">
              <Mail
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                  if (message) setMessage("");
                }}
                onBlur={() => {
                  if (email.trim()) {
                    setEmailError(getEmailValidationError(email) || "");
                  }
                }}
                placeholder="member@email.com"
                className={`field-input pl-10 ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100" : ""}`}
                autoComplete="email"
                suppressHydrationWarning
              />
            </div>
            {emailError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{emailError}</p>
            )}
          </div>

          <OrgRoleSelect
            roles={roles}
            value={role}
            onChange={setRole}
            canCreateRole={canViewAdmin && !!organizationId}
            onRequestCreateRole={() => setCreateRoleOpen(true)}
          />

          {message && (
            <p
              className={`text-sm rounded-xl px-4 py-3 ${
                /invitation sent|sent to|joined/i.test(message)
                  ? "text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30"
                  : "text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex justify-end gap-3 dark:border-slate-800 dark:bg-slate-800/60">
          <button onClick={() => setOpen(false)} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !email.trim()}
            className="btn btn-primary"
          >
            {loading ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </ModalShell>

      {organizationId && (
        <CreateRoleDialog
          orgId={organizationId}
          open={createRoleOpen}
          onClose={() => setCreateRoleOpen(false)}
          roles={roles}
          onCreated={(created) => {
            void loadRoles();
            setRole(created.id);
          }}
        />
      )}
    </>
  );
}
