"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/validation/api";
import {
  EyeOff,
  EyeOpen,
  LockHeaderIcon,
} from "@/components/auth/icons";
import "../../login/login.css";
import { passwordPolicyError } from "@/lib/passwordPolicy";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setMessage("");

    const weakPassword = passwordPolicyError(password);
    if (weakPassword) {
      setError(weakPassword);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Invalid or expired reset link.");
        return;
      }

      setMessage(
        data.message
          ? `${data.message}. Redirecting to sign in…`
          : "Password reset successfully. Redirecting to sign in…"
      );
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError("Unable to reset your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="auth-bg-base" aria-hidden="true" />
      <div className="auth-wrap">
        <div className="auth-card">

          <div className="auth-head">
            <div className="auth-icon">
              <LockHeaderIcon />
            </div>
            <h1>Reset password</h1>
            <p>Choose a new password for the organization linked to this reset email.</p>
            <div className="rule" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>

            <div className="field has-icon">
              <label htmlFor="reset-pw">New password</label>
              <div className="field-control">
                <input
                  id="reset-pw"
                  type={showPw ? "text" : "password"}
                  placeholder="Enter new password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  suppressHydrationWarning
                  required
                />
                <button
                  type="button"
                  className="vis-toggle"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw(v => !v)}
                >
                  {showPw ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>

            <div className="field has-icon">
              <label htmlFor="reset-pw-confirm">Confirm password</label>
              <div className="field-control">
                <input
                  id="reset-pw-confirm"
                  type={showConfirmPw ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  suppressHydrationWarning
                  required
                />
                <button
                  type="button"
                  className="vis-toggle"
                  aria-label={showConfirmPw ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmPw(v => !v)}
                >
                  {showConfirmPw ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`btn-submit${loading ? " loading" : ""}`}
              disabled={loading}
            >
              <span className="lbl">Reset password</span>
              <span className="spin" />
            </button>

          </form>

          <div className="auth-foot">
            Remembered your password?&nbsp;<a href="/login">Sign in</a>
          </div>

        </div>
      </div>
    </>
  );
}
