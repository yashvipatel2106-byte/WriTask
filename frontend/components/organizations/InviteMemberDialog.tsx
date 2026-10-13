"use client";

import { useState } from "react";
import { Mail, UserPlus } from "lucide-react";
import { authFetch } from "@/lib/validation/authFetch";
import { DEPARTMENT_OPTIONS } from "@/lib/constants/departments";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import FormLabel from "@/components/ui/FormLabel";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import OrgRoleSelect from "@/components/rbac/OrgRoleSelect";
import CreateRoleDialog from "@/components/rbac/CreateRoleDialog";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { getEmailValidationError } from "@/lib/validation/email";

type InviteMemberDialogProps = {
  orgId: string;
  orgName: string;
  onInvited?: () => void;
};

export default function InviteMemberDialog({
  orgId,
  orgName,
  onInvited,
}: InviteMemberDialogProps) {
  const { canViewAdmin } = useOrgPermission();
  const { roles, loadRoles } = useOrgRoles(orgId);
  const [open, setOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");
  const [department, setDepartment] = useState("Engineering");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState("");

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

    const res = await authFetch(`/organizations/${orgId}/invite`, {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), role, department }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage(data.message);
      setEmail("");
      onInvited?.();
      setTimeout(() => setOpen(false), 1500);
    } else {
      setMessage(data.message || "Failed to send invitation");
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <UserPlus size={16} />
        Invite Member
      </button>
    );
  }

  return (
    <>
      <ModalShell onClose={() => setOpen(false)} maxWidth="lg" className="overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0">
              <UserPlus size={18} className="text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <ModalHeader
                title={`Invite to ${orgName}`}
                subtitle="Enter email, choose a role, and assign a department."
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
                  if (message && !message.includes("sent")) setMessage("");
                }}
                onBlur={() => {
                  if (email.trim()) {
                    setEmailError(getEmailValidationError(email) || "");
                  }
                }}
                placeholder="member@email.com"
                className={`field-input pl-10 ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100" : ""}`}
                autoComplete="email"
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
            canCreateRole={canViewAdmin}
            onRequestCreateRole={() => setCreateRoleOpen(true)}
          />

          <div>
            <FormLabel>Department</FormLabel>
            <Select
              value={department}
              onChange={setDepartment}
              options={DEPARTMENT_OPTIONS.map((dept) => ({ value: dept, label: dept }))}
              className="w-full"
            />
          </div>

          {message && (
            <p
              className={`text-sm rounded-xl px-4 py-3 ${
                message.includes("sent")
                  ? "text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-400"
                  : "text-red-600 bg-red-50 border border-red-20 dark:text-red-400 "
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
          <button onClick={submit} disabled={loading || !email.trim()} className="btn btn-primary">
            {loading ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </ModalShell>

      <CreateRoleDialog
        orgId={orgId}
        open={createRoleOpen}
        onClose={() => setCreateRoleOpen(false)}
        roles={roles}
        onCreated={(created) => {
          void loadRoles();
          setRole(created.id);
        }}
      />
    </>
  );
}
