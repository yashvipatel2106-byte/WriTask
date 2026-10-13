"use client";

import { FormEvent, useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/validation/api";
import { useConstellation } from "@/hooks/useConstellation";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";
import {
  EyeOff,
  EyeOpen,
  LockIcon,
  MailIcon,
  UserFieldIcon,
} from "@/components/auth/icons";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import Logo from "@/components/ui/Logo";
import { writeStoredOrgId, clearStoredProjectId } from "@/lib/orgStorage";
import { getEmailValidationError } from "@/lib/validation/email";
import { toast } from "@/components/ui/toast";
import "../login/login.css";

const WIZARD_PW_KEY = "writaskWizardPw";
const VERIFY_EMAIL_KEY = "verifyEmail";

type Step = "account" | "verify";

function SignupPageInner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConstellation(canvasRef);
  useAllowPageScroll();
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const otpSubmitting = useRef(false);

  const [step, setStep] = useState<Step>("account");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/dashboard");
      return;
    }
    try {
      const savedEmail = localStorage.getItem(VERIFY_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setStep("verify");
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  const persistSession = (data: {
    token: string;
    user: Record<string, unknown>;
  }) => {
    localStorage.setItem("token", data.token);
    const id = String(data.user.id ?? data.user._id ?? "");
    const stored = {
      id,
      username: String(data.user.username ?? ""),
      email: String(data.user.email ?? ""),
      systemRole: data.user.systemRole ? String(data.user.systemRole) : undefined,
      avatarColor: data.user.avatarColor ? String(data.user.avatarColor) : "",
      hasPassword:
        typeof data.user.hasPassword === "boolean" ? data.user.hasPassword : true,
    };
    localStorage.setItem("user", JSON.stringify(stored));
    if (id) localStorage.setItem("userId", id);
    writeStoredOrgId(null);
    clearStoredProjectId();
  };

  const submitAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const emailErr = getEmailValidationError(email.trim());
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!username.trim() || password.length < 6) {
      setError("Username, email, and a password (6+ characters) are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Could not create your account.");
        return;
      }

      localStorage.setItem(VERIFY_EMAIL_KEY, email.trim());
      try {
        sessionStorage.setItem(WIZARD_PW_KEY, password);
      } catch {
        /* ignore */
      }
      toast.success(data.message || "Verification code sent");
      setStep("verify");
      setOtp(["", "", "", "", "", ""]);
    } catch {
      setError("Could not create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async (codeOverride?: string) => {
    if (otpSubmitting.current) return;

    const code = (codeOverride || otp.join("")).trim();
    let passwordForLogin = password;
    if (!passwordForLogin) {
      try {
        passwordForLogin = sessionStorage.getItem(WIZARD_PW_KEY) || "";
      } catch {
        passwordForLogin = "";
      }
    }

    const verifyEmail = email.trim() || localStorage.getItem(VERIFY_EMAIL_KEY) || "";
    if (!verifyEmail) {
      setError("Email missing — go back and create your account.");
      return;
    }
    if (code.length < 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    if (!passwordForLogin) {
      setError("Session expired — go back and enter your password again.");
      setStep("account");
      return;
    }

    otpSubmitting.current = true;
    setLoading(true);
    setError("");
    try {
      const verifyRes = await fetch(apiUrl("/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, otp: code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        setError(verifyData.message || "Invalid code.");
        return;
      }

      const loginRes = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: verifyEmail,
          password: passwordForLogin,
        }),
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        setError(loginData.message || "Verified — please sign in to continue.");
        return;
      }

      localStorage.removeItem(VERIFY_EMAIL_KEY);
      try {
        sessionStorage.removeItem(WIZARD_PW_KEY);
      } catch {
        /* ignore */
      }

      persistSession({
        token: loginData.token,
        user: loginData.user,
      });
      window.location.href = "/dashboard";
    } catch {
      setError("Could not verify. Please try again.");
    } finally {
      otpSubmitting.current = false;
      setLoading(false);
    }
  };

  const onOtpChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every((d) => d)) {
      void submitVerify(next.join(""));
    }
  };

  const onOtpKeyDown = (index: number, key: string) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitVerify();
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
            <h1>{step === "verify" ? "Check your email" : "Create account"}</h1>
            <p>
              {step === "verify"
                ? `Enter the 6-digit code sent to ${email || "your email"}`
                : "Sign up to open your Personal Workspace"}
            </p>
            <div className="rule" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {step === "account" ? (
            <form className="auth-form" onSubmit={submitAccount} noValidate>
              <div className="field has-lead-icon">
                <label htmlFor="signup-username">Username</label>
                <div className="field-control">
                  <span className="field-icon">
                    <UserFieldIcon />
                  </span>
                  <input
                    id="signup-username"
                    type="text"
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    suppressHydrationWarning
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="field has-lead-icon">
                <label htmlFor="signup-email">Email</label>
                <div className="field-control">
                  <span className="field-icon">
                    <MailIcon />
                  </span>
                  <input
                    id="signup-email"
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
                <label htmlFor="signup-pw">Password</label>
                <div className="field-control">
                  <span className="field-icon">
                    <LockIcon />
                  </span>
                  <input
                    id="signup-pw"
                    type={showPw ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    suppressHydrationWarning
                    required
                    minLength={6}
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

              <button
                type="submit"
                className={`btn-submit${loading ? " loading" : ""}`}
                disabled={loading}
              >
                <span className="lbl">Continue</span>
                <span className="spin" />
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleVerifySubmit} noValidate>
              <div className="auth-otp" role="group" aria-label="Verification code">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    className="auth-otp-cell"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => onOtpChange(index, e.target.value)}
                    onKeyDown={(e) => onOtpKeyDown(index, e.key)}
                    aria-label={`Digit ${index + 1}`}
                    autoFocus={index === 0}
                    disabled={loading}
                    suppressHydrationWarning
                  />
                ))}
              </div>

              <div className="aux-row" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={() => {
                    setStep("account");
                    setError("");
                    setOtp(["", "", "", "", "", ""]);
                  }}
                >
                  Use a different email
                </button>
              </div>

              <button
                type="submit"
                className={`btn-submit${loading ? " loading" : ""}`}
                disabled={loading}
              >
                <span className="lbl">Verify &amp; continue</span>
                <span className="spin" />
              </button>
            </form>
          )}

          {step === "account" && (
            <>
              <div className="or-divider">or</div>
              <GoogleSignInButton text="signup_with" />
            </>
          )}

          <p className="auth-foot">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}
