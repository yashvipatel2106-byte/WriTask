"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OrgFieldIcon } from "@/components/auth/icons";

export type AuthOrgOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  id?: string;
  value: string;
  options: AuthOrgOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Auth-page organization picker. Matches login field chrome (violet focus,
 * field-bg, leading icon) instead of a native <select>, whose option popup
 * cannot be themed and looks broken next to the rest of the auth form.
 */
export default function AuthOrgSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className="auth-select">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`auth-select-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="auth-select-icon" aria-hidden>
          <OrgFieldIcon />
        </span>
        <span className="auth-select-value">
          <span className="auth-select-label">{selected?.label ?? "Select organization"}</span>
          {selected?.hint ? (
            <span className="auth-select-hint">{selected.hint}</span>
          ) : null}
        </span>
        <span className={`auth-select-chevron${open ? " is-open" : ""}`} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-labelledby={id}
            className="auth-select-menu"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`auth-select-option${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="auth-select-option-text">
                    <span className="auth-select-option-label">{opt.label}</span>
                    {opt.hint ? (
                      <span className="auth-select-option-hint">{opt.hint}</span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <svg
                      className="auth-select-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      aria-hidden
                    >
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
