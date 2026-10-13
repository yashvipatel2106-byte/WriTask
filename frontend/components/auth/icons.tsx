/** Shared auth-page icons (same SVGs as before — no visual changes). */

export const EyeOpen = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOff = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    <path d="M9.9 4.2A11 11 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-2.6 3.4M6.1 6.1A13.4 13.4 0 0 0 1 11s4 7 11 7a10.6 10.6 0 0 0 4.2-.8" />
  </svg>
);

export const MailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="3" />
    <path d="M3 6l9 6 9-6" />
  </svg>
);

/** Field lock icon (stroke = currentColor) — login / signup password fields */
export const LockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

/** Header lock icon with gradient — reset-password page */
export const LockHeaderIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="url(#lg3)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="lg3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7C6DFA" />
        <stop offset="100%" stopColor="#2DD4BF" />
      </linearGradient>
    </defs>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const UserIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="url(#lg2)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7C6DFA" />
        <stop offset="100%" stopColor="#2DD4BF" />
      </linearGradient>
    </defs>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const UserFieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/** Organization / workspace field icon — login multi-org picker */
export const OrgFieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 21h18" />
    <path d="M5 21V7l7-4 7 4v14" />
    <path d="M9 21v-6h6v6" />
    <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
  </svg>
);

export const ShieldIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="url(#lg-shield)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <defs>
      <linearGradient id="lg-shield" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7C6DFA" />
        <stop offset="100%" stopColor="#2DD4BF" />
      </linearGradient>
    </defs>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
