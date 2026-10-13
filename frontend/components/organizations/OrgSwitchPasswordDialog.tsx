"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import { authFetch } from "@/lib/validation/authFetch";
import { apiUrl } from "@/lib/validation/api";
import { writeStoredOrgId, clearStoredProjectId } from "@/lib/orgStorage";
import { clearStoredWorkspaceId } from "@/lib/workspaceStorage";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type Props = {
  organizationId: string;
  organizationName: string;
  onClose: () => void;
  onSwitched: (organizationId: string) => void;
};

export default function OrgSwitchPasswordDialog({
  organizationId,
  organizationName,
  onClose,
  onSwitched,
}: Props) {
  const { email } = useCurrentUser();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  /** Browser autofill updates the DOM but not React state — sync before submit/toggle. */
  const syncPasswordFromDom = () => {
    const domValue = passwordRef.current?.value ?? "";
    const next = domValue || password;
    if (next !== password) setPassword(next);
    return next;
  };

  useEffect(() => {
    const sync = () => {
      const domValue = passwordRef.current?.value ?? "";
      if (domValue) setPassword(domValue);
    };
    sync();
    const timers = [100, 300, 600].map((ms) => window.setTimeout(sync, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  const toggleShowPassword = () => {
    syncPasswordFromDom();
    setShowPassword((v) => !v);
  };

  const forgotHref = (() => {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    params.set("organizationId", organizationId);
    return `/forgot-password?${params.toString()}`;
  })();

  const confirm = async () => {
    const resolvedPassword = syncPasswordFromDom();
    if (!resolvedPassword) {
      setError("Password is required");
      return;
    }
    if (typeof window !== "undefined" && !localStorage.getItem("token")) {
      setError("Your session expired. Please sign in again.");
      return;
    }
    setLoading(true);
    setError("");
    setResetMessage("");
    try {
      const res = await authFetch(`/organizations/${organizationId}/switch`, {
        method: "POST",
        body: JSON.stringify({ password: resolvedPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.message || "Invalid password";
        if (String(msg).toLowerCase().includes("no token")) {
          throw new Error("Your session expired. Please sign in again.");
        }
        throw new Error(msg);
      }
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      clearStoredProjectId();
      clearStoredWorkspaceId();
      writeStoredOrgId(organizationId);
      onSwitched(organizationId);
      onClose();
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid password");
    } finally {
      setLoading(false);
    }
  };

  const sendResetLink = async () => {
    if (!email) {
      setError("Unable to determine your email. Open Forgot password from the login page.");
      return;
    }
    setSendingReset(true);
    setError("");
    setResetMessage("");
    try {
      const res = await fetch(apiUrl("/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          organizationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to send reset link");
      }
      setResetMessage(
        data.message ||
          `Reset link sent to ${email} for ${organizationName}. Use it to set a new password for this organization only.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send reset link");
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth="md" className="overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <ModalHeader
          title={`Switch to ${organizationName}`}
          subtitle="Enter the password for this organization to continue."
          onClose={onClose}
          className="mb-0"
        />
      </div>
      <form
        className="px-6 py-5 space-y-4"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        {/*
          Browsers pair a password field with the nearest username/email input.
          Without this sink they dump the saved Gmail into page search bars.
        */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email || ""}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
        <div>
          <FormLabel>Password</FormLabel>
          <div className="relative">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autoFocus
              autoComplete="current-password"
              className="field-input pr-10"
              placeholder="Organization password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={toggleShowPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void sendResetLink()}
              disabled={sendingReset || loading}
              className="text-sm text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300 disabled:opacity-50"
            >
              {sendingReset ? "Sending reset link…" : "Forgot password?"}
            </button>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sends a reset link for{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {organizationName}
              </span>{" "}
              only.{" "}
              <Link
                href={forgotHref}
                className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                onClick={onClose}
              >
                Or open the reset page
              </Link>
              .
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {resetMessage && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{resetMessage}</p>
        )}
        <div className="flex justify-end gap-2 pt-1 pb-1">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Switching…" : "Confirm switch"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
