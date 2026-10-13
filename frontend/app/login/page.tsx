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

  // After setting a password from an invitation link, the accept page
  // sends the invited email here so the person logs in with that exact
  // account instead of retyping it.
  const [userId, setUserId] = useState(() => searchParams.get("userId") || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!userId.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Invalid user ID or password");
        return;
      }

      if (!data.token || !data.user) {
        setError("Invalid login response from server.");
        return;
      }

      completeLoginRedirect({
        token: data.token,
        user: data.user,
        organizationId: data.organizationId ?? null,
        next: searchParams.get("next"),
      });
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const forgotHref = userId.trim().includes("@")
    ? `/forgot-password?email=${encodeURIComponent(userId.trim())}`
    : "/forgot-password";

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
            <p>Sign in with your organization password</p>
            <div className="rule" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <div className="field has-lead-icon">
              <label htmlFor="login-userid">Username</label>
              <div className="field-control">
                <span className="field-icon">
                  <MailIcon />
                </span>
                <input
                  id="login-userid"
                  type="text"
                  placeholder="Username or email"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  autoComplete="username"
                  suppressHydrationWarning
                  required
                  autoFocus
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
              <a href={forgotHref}>Forgot password?</a>
            </div>

            <button
              type="submit"
              className={`btn-submit${loading ? " loading" : ""}`}
              disabled={loading}
            >
              <span className="lbl">Sign in</span>
              <span className="spin" />
            </button>
          </form>

          <div className="or-divider">or</div>
          <GoogleSignInButton text="signin_with" />

          <p className="auth-foot">
            Don&apos;t have an account? <a href="/signup">Sign up</a>
          </p>
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
