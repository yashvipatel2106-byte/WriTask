"use client";

import { authFetch } from "@/lib/validation/authFetch";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Preview = {
  valid: boolean;
  email?: string;
  organizationName?: string;
  role?: string;
  message?: string;
};

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loadingPreview, setLoadingPreview] = useState(() => Boolean(token));
  const [preview, setPreview] = useState<Preview | null>(() =>
    token ? null : { valid: false, message: "No invitation token found." }
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    authFetch(`/organizations/invitations/token/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setPreview({
          valid: Boolean(data.valid),
          email: data.email,
          organizationName: data.organizationName,
          role: data.role,
          message: data.message,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ valid: false, message: "Unable to check this invitation right now." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const passwordStrengthError = (value: string): string | null => {
    if (value.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
      return "Password must include at least one letter and one number.";
    }
    return null;
  };

  const accept = async () => {
    if (!token || saving) return;

    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/organizations/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccessMessage(
          data.message || "Password set successfully. Please log in to continue."
        );
        const email = data.email || preview?.email || "";
        setTimeout(() => {
          router.push(email ? `/login?userId=${encodeURIComponent(email)}` : "/login");
        }, 1800);
      } else {
        setError(data.message || "Failed to accept invitation");
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingPreview) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <p>Checking invitation…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 max-w-md w-full dark:bg-slate-900 dark:border-slate-800">
        <h1 className="text-2xl font-bold mb-2 text-center">Organization Invitation</h1>

        {successMessage ? (
          <p className="text-center text-slate-600 dark:text-slate-300">{successMessage}</p>
        ) : !preview?.valid ? (
          <p className="text-center text-sm text-red-600 dark:text-red-400">
            {preview?.message || "This invitation link is invalid."}
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-5 text-center dark:text-slate-400">
              You&apos;re joining{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {preview.organizationName || "the organization"}
              </span>
              {preview.role ? <> as <span className="font-medium">{preview.role}</span></> : null}
              . Set a password to finish joining.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={preview.email || ""}
                  readOnly
                  disabled
                  className="field-input opacity-70 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  placeholder="At least 8 characters, with a letter and a number"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="field-input"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <button
                type="button"
                onClick={() => void accept()}
                disabled={saving}
                className="btn btn-primary w-full"
              >
                {saving ? "Setting password…" : "Accept invitation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}
