"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { apiUrl } from "@/lib/validation/api";
import { completeLoginRedirect } from "@/lib/authUser";

type GoogleCredentialResponse = { credential: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      text?: "signin_with" | "signup_with" | "continue_with";
    }
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

type Props = {
  /** "signin_with" on the login page, "signup_with" on the signup page. */
  text?: "signin_with" | "signup_with" | "continue_with";
};

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton({ text = "continue_with" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scriptReady || !CLIENT_ID || !buttonRef.current || !wrapRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: async (response) => {
        setError("");
        try {
          const res = await fetch(apiUrl("/auth/google"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();

          if (!res.ok || !data.token || !data.user) {
            setError(data?.message || "Google sign-in failed.");
            return;
          }

          completeLoginRedirect(data);
        } catch {
          setError("Something went wrong. Please try again.");
        }
      },
    });

    // Google's renderButton only accepts a fixed pixel width (no 100%/auto),
    // so it has to be measured from the actual container instead of a
    // hardcoded value — otherwise it overflows narrow mobile auth cards.
    const renderAtContainerWidth = () => {
      if (!buttonRef.current || !wrapRef.current || !window.google) return;
      const width = Math.max(200, Math.min(400, Math.floor(wrapRef.current.clientWidth)));
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width,
        text,
      });
    };

    renderAtContainerWidth();

    const observer = new ResizeObserver(() => renderAtContainerWidth());
    observer.observe(wrapRef.current);

    return () => observer.disconnect();
  }, [scriptReady, text]);

  if (!CLIENT_ID) return null;

  return (
    <div ref={wrapRef} className="w-full">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div ref={buttonRef} className="flex justify-center overflow-hidden" />
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
