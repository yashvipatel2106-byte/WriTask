"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/validation/api";
import { useConstellation } from "@/hooks/useConstellation";
import { ShieldIcon } from "@/components/auth/icons";
import "../login/login.css";

/* ─── OTP Input Boxes ────────────────────────────────────── */
function OtpBoxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const arr = value.split("");
    arr[i] = char;
    const next = arr.join("").slice(0, 6);
    onChange(next);
    if (char && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputs.current[focusIdx]?.focus();
    e.preventDefault();
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "clamp(4px, 2vw, 10px)",
        justifyContent: "center",
        margin: "8px 0 28px",
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          suppressHydrationWarning
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: "clamp(32px, 9vw, 48px)",
            height: "clamp(40px, 10vw, 56px)",
            textAlign: "center",
            fontSize: "clamp(16px, 4vw, 22px)",
            fontWeight: 600,
            fontFamily: "'Inter', system-ui, sans-serif",
            background: value[i] ? "var(--field-bg-focus)" : "var(--field-bg)",
            border: `1px solid ${
              value[i] ? "rgba(124,109,250,0.5)" : "var(--border)"
            }`,
            borderRadius: "12px",
            color: "var(--bone)",
            outline: "none",
            caretColor: "#6D5DFC",
            transition: "border-color 0.2s, box-shadow 0.2s",
            boxShadow: value[i]
              ? "0 0 0 3px rgba(124,109,250,0.12)"
              : "none",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────── */
export default function VerifyOTP() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConstellation(canvasRef);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    const email = localStorage.getItem("verifyEmail");
    if (!email) {
      setError("Email not found. Please register again.");
      return;
    }
    if (otp.length < 6) {
      setError("Please enter the full 6-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(apiUrl("/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.removeItem("verifyEmail");
        router.push("/login");
      } else {
        setError(data.message || "Invalid OTP. Please try again.");
      }
    } catch {
      setError("Unable to verify your code. Please try again.");
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

      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-icon">
              <ShieldIcon />
            </div>
            <h1>Verify your email</h1>
            <p>Enter the 6-digit code sent to your inbox</p>
            <div className="rule" />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <OtpBoxes value={otp} onChange={setOtp} />

          <button
            className={`btn-submit${loading ? " loading" : ""}`}
            disabled={loading || otp.length < 6}
            onClick={handleVerify}
          >
            <span className="lbl">Verify OTP</span>
            <span className="spin" />
          </button>

          <div className="auth-foot">
            Wrong email?&nbsp;<a href="/signup">Go back to sign up</a>
          </div>
        </div>
      </div>
    </>
  );
}
