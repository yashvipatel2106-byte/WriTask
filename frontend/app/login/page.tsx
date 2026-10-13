"use client";

import { useState, FormEvent, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { completeLoginRedirect } from "@/lib/authUser";
import { apiUrl } from "@/lib/validation/api";
import { useConstellation } from "@/hooks/useConstellation";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";
import { EyeOff, EyeOpen, LockIcon, MailIcon } from "@/components/auth/icons";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import Logo from "@/components/ui/Logo";
import "./login.css";

function LoginPageInner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConstellation(canvasRef);
  const searchParams = useSearchParams();
  useAllowPageScroll();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          data?.message ||
            (res.status === 404
              ? "Account not found. Please sign up first."
              : "Invalid email or password.")
        );
        return;
      }

      if (!data.token || !data.user) {
        setError("Invalid login response from server.");
        return;
      }

      localStorage.setItem("token", data.token);
      const profile = data.user;
      localStorage.setItem(
        "user",
        JSON.stringify({
          ...profile,
          hasPassword:
            typeof profile.hasPassword === "boolean" ? profile.hasPassword : true,
        })
      );
      if (data.organizationId) {
        localStorage.setItem("organizationId", String(data.organizationId));
      } else {
        localStorage.removeItem("organizationId");
      }

      const pendingInvite = localStorage.getItem("pendingInviteToken");
      const pendingProjectInvite = localStorage.getItem(
        "pendingProjectInviteToken"
      );
      const nextParam = searchParams.get("next");
      const safeNext =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : null;

      window.location.href = pendingProjectInvite
        ? `/invitations/project?token=${pendingProjectInvite}`
        : pendingInvite
          ? `/invitations/accept?token=${pendingInvite}`
          : safeNext || "/dashboard";
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="auth-bg-base" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="constellation-canvas"
        aria-hidden="true"
      />
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />

      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-icon">
              <Logo className="auth-icon-logo" />
            </div>
            <h1>Welcome back</h1>
            <p>Sign in to your account</p>
            <div className="rule" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="field has-lead-icon">
              <label htmlFor="login-email">Email address</label>
              <div className="field-control">
                <span className="field-icon">
                  <MailIcon />
                </span>
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  suppressHydrationWarning
                  required
                />
              </div>
            </div>

            <div className="field has-icon has-lead-icon">
              <label htmlFor="login-pw">Password</label>
              <div className="field-control">
                <span className="field-icon">
                  <LockIcon />
                </span>
                <input
                  id="login-pw"
                  type={showPw ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  suppressHydrationWarning
                  required
                />
                <button
                  type="button"
                  className="vis-toggle"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>

            <div className="aux-row">
              <a href="/forgot-password">Forgot password?</a>
            </div>

            <button
              type="submit"
              className={`btn-submit${loading ? " loading" : ""}`}
              disabled={loading}
            >
              <span className="lbl ">Sign in</span>
              <span className="spin" />
            </button>
          </form>

          <div className="or-divider">or</div>
          <GoogleSignInButton text="signin_with" />

          <div className="auth-foot">
            New here?&nbsp;<a href="/signup">Create an account</a>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
