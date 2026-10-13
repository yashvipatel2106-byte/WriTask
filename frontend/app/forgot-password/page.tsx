"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/validation/api";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";
import "../login/login.css";

function ForgotPasswordInner() {
  useAllowPageScroll();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") || "";
  const [email, setEmail] = useState(() => searchParams.get("email") || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleForgotPassword = async () => {
    try {
      const body: Record<string, string> = { email };
      // Optional; backend only accepts it after validating membership.
      if (organizationId) body.organizationId = organizationId;

      const response = await fetch(apiUrl("/auth/forgot-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setError("");
        setMessage(data.message);
      } else {
        setMessage("");
        setError(data.message);
      }
    } catch (err) {
      setError("Unable to send reset link. Please try again.");
    }
  };

  return (
    <>
    <div className="auth-bg-base" aria-hidden="true" />
    <div className="auth-wrap">
      <div className="auth-card">

        <div className="auth-head">
          <h1>Forgot Password</h1>
          <p>
            {organizationId
              ? "Enter your email to receive a reset link for the selected organization. Other organizations keep their passwords."
              : "Enter your email address to receive a password reset link."}
          </p>
          <div className="rule" />
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <div className="auth-form">
          <div className="field">
            <label htmlFor="forgot-email">Email address</label>
            <input
              id="forgot-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              suppressHydrationWarning
              onChange={(e) =>
                setEmail(e.target.value)
              }
            />
          </div>

          <button
            type="button"
            className="btn-submit"
            onClick={handleForgotPassword}
          >
            <span className="lbl">Send Reset Link</span>
            <span className="spin" />
          </button>
        </div>

        <div className="auth-foot">
          <a href="/login">&larr; Back to login</a>
        </div>

      </div>
    </div>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
