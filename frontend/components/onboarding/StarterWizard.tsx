"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FolderKanban,
  Home,
  Inbox,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import Logo from "@/components/ui/Logo";
import Select from "@/components/ui/Select";
import { apiUrl } from "@/lib/validation/api";
import { authFetch } from "@/lib/validation/authFetch";
import { writeStoredOrgId, clearStoredProjectId } from "@/lib/orgStorage";
import { useOrganization } from "@/components/context/organizationContext";
import { DEPARTMENT_OPTIONS } from "@/lib/constants/departments";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";
import { toast } from "@/components/ui/toast";
import { getEmailValidationError } from "@/lib/validation/email";
import "./starter-wizard.css";

type InviteRow = { email: string; role: string; department: string };
type StepId = "account" | "verify" | "org" | "project" | "tasks" | "invite";

const WIZARD_STATE_KEY = "writaskWizardState";
const WIZARD_PW_KEY = "writaskWizardPw";
const AUTHED_STEPS: StepId[] = ["org", "project", "tasks", "invite"];
const ALL_STEPS: StepId[] = ["account", "verify", "org", "project", "tasks", "invite"];

const ROLE_OPTIONS = [
  { value: "developer", label: "Developer" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

const DEPARTMENT_SELECT_OPTIONS = DEPARTMENT_OPTIONS.map((d) => ({
  value: d,
  label: d,
}));

const obSelectTrigger = (open: boolean) =>
  `ob-select-trigger${open ? " is-open" : ""}`;

type WizardPersist = {
  step: StepId;
  authed: boolean;
  email?: string;
  name?: string;
  orgName?: string;
  orgId?: string | null;
  projectName?: string;
  projectId?: string | null;
  tasks?: string[];
  tasksCreated?: boolean;
};

function clearStaleSignupAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  localStorage.removeItem("organizationId");
}

function readWizardState(): WizardPersist | null {
  try {
    const raw = localStorage.getItem(WIZARD_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardPersist;
    if (!parsed?.step || !ALL_STEPS.includes(parsed.step)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWizardState(patch: Partial<WizardPersist> & { step: StepId; authed: boolean }) {
  try {
    const prev = readWizardState() || { step: "account", authed: false };
    localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore */
  }
}

function clearWizardState() {
  try {
    localStorage.removeItem(WIZARD_STATE_KEY);
    sessionStorage.removeItem(WIZARD_PW_KEY);
  } catch {
    /* ignore */
  }
}

const STEP_HEADLINE: Record<StepId, string> = {
  account: "Create your WriTask account",
  verify: "Enter the code we emailed you",
  org: "What’s your organization called?",
  project: "What’s your team working on?",
  tasks: "Add a few starter tasks",
  invite: "Invite people to your workspace",
};

function emptyInvite(): InviteRow {
  return { email: "", role: "developer", department: "Engineering" };
}

function LivePreview({
  step,
  orgName,
  projectName,
  tasks,
  invites,
}: {
  step: StepId;
  orgName: string;
  projectName: string;
  tasks: string[];
  invites: InviteRow[];
}) {
  const spaceLabel = orgName.trim() || "Your organization";
  const projectLabel = projectName.trim() || "First project";
  const hasProject = Boolean(projectName.trim());
  const visibleTasks = tasks.map((t) => t.trim()).filter(Boolean);
  const rows =
    visibleTasks.length > 0
      ? visibleTasks.slice(0, 3)
      : ["", "", ""];
  const people = invites.map((i) => i.email.trim()).filter(Boolean);

  return (
    <div className="ob-preview-col" aria-hidden="true">
      <svg className="ob-wave" viewBox="0 0 400 400" fill="none">
        <path
          d="M40 260 C 90 180, 150 320, 220 240 C 290 160, 340 220, 400 120"
          stroke="#67E8F9"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M20 300 C 100 220, 160 340, 240 260 C 320 180, 360 240, 420 160"
          stroke="#22D3EE"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.35"
        />
      </svg>

      <div className="ob-float-bits">
        <div className="ob-float-bit b1">
          <div className="bit-title">
            <span className="bit-icon">
              <FolderKanban size={12} />
            </span>
            Planning
          </div>
          <div className="bit-bar">
            <i />
          </div>
          <p className="bit-meta">WriTask timeline</p>
        </div>
        <div className="ob-float-bit b2">
          <div className="bit-title">
            <span className="bit-icon">
              <Zap size={12} />
            </span>
            Progress
          </div>
          <p className="bit-meta" style={{ fontSize: "1.05rem", fontWeight: 800 }}>
            75%
          </p>
        </div>
        <div className="ob-float-bit b3">
          <div className="bit-title">
            <span className="bit-icon">
              <UserPlus size={12} />
            </span>
            Team
          </div>
          <p className="bit-meta">Collaborate in real time</p>
        </div>
      </div>

      <div className="ob-preview-shell" key={step}>
        <aside className="ob-pv-side">
          <div className="ob-pv-logo">
            <Logo className="h-[1.15rem] w-[1.15rem]" staysLight />
            WriTask
          </div>
          <div className="ob-pv-nav is-active">
            <Home size={11} /> Dashboard
          </div>
          <div className="ob-pv-nav">
            <Inbox size={11} /> Inbox
          </div>

          <div className={`ob-pv-space ${orgName.trim() ? "is-live" : ""}`}>
            <span className="ob-pv-space-dot">
              <img src="/logo-dark.png" alt="" />
            </span>
            <span>{spaceLabel}</span>
          </div>

          <div className="ob-pv-heading">Project</div>

          <div className={`ob-pv-project ${hasProject || step !== "project" ? "is-live" : ""}`}>
            <FolderKanban size={11} />
            <span>{projectLabel}</span>
          </div>

          <div className="ob-pv-nav">
            <Plus size={11} /> New project
          </div>

          <div
            className={`ob-pv-invite-btn ${step === "invite" ? "is-pulse" : ""}`}
          >
            <UserPlus size={11} /> Invite
          </div>
        </aside>

        <div className="ob-pv-main">
          <div className="ob-pv-topbar">
            <Logo className="h-4 w-4" staysLight />
            <strong>{projectLabel}</strong>
          </div>
          <div className="ob-pv-tabs">
            <span className="is-on">Table</span>
            <span>Board</span>
            <span>Calendar</span>
          </div>

          <div className="ob-pv-table">
            <div className="ob-pv-thead">
              <span>Name</span>
              <span>Status</span>
              <span>Priority</span>
            </div>
            {rows.map((title, i) => (
              <div
                className="ob-pv-row"
                key={`${title}-${i}`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {title ? (
                  <span className="ob-pv-name">{title}</span>
                ) : (
                  <span className="ob-pv-skel" style={{ width: `${70 - i * 12}%` }} />
                )}
                {title ? (
                  <span className="ob-pv-status">
                    <i /> To do
                  </span>
                ) : (
                  <span className="ob-pv-skel" style={{ width: "55%" }} />
                )}
                <span className="ob-pv-skel" style={{ width: title ? "40%" : "50%" }} />
              </div>
            ))}
          </div>

          {people.length > 0 && (
            <div className="ob-pv-people">
              {people.slice(0, 4).map((email) => (
                <span className="ob-pv-person" key={email}>
                  {email}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StarterWizard() {
  useAllowPageScroll();
  const router = useRouter();
  const { refreshAccess, setCurrentOrgId } = useOrganization();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [step, setStep] = useState<StepId>("account");
  const [animKey, setAnimKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [hasPassword, setHasPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [showAccountPw, setShowAccountPw] = useState(false);
  const [showOrgPw, setShowOrgPw] = useState(false);
  const [showOrgConfirmPw, setShowOrgConfirmPw] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpSubmitting = useRef(false);

  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>(["", "", ""]);
  const [tasksCreated, setTasksCreated] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([emptyInvite()]);
  const [finished, setFinished] = useState(false);

  const flow = useMemo<StepId[]>(() => {
    if (authed) return AUTHED_STEPS;
    return ["account", "verify"];
  }, [authed]);

  const stepIndex = Math.max(0, flow.indexOf(step));
  const canGoBack = stepIndex > 0;

  // Keep signup wizard light (marketing surface) without writing theme preference.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    root.setAttribute("data-wizard-light", "1");
    return () => {
      root.removeAttribute("data-wizard-light");
      if (wasDark) root.classList.add("dark");
      else root.classList.remove("dark");
      root.style.colorScheme = prevScheme || (wasDark ? "dark" : "light");
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const existingOrg = localStorage.getItem("organizationId");
    const saved = readWizardState();

    if (token && existingOrg) {
      clearWizardState();
      router.replace("/dashboard");
      return;
    }

    // Resume mid-wizard so Back / refresh does not dump users on Create account.
    if (saved?.authed && token) {
      setAuthed(true);
      const storedOrg = saved.orgId || localStorage.getItem("organizationId");
      if (storedOrg) setOrgId(storedOrg);
      if (saved.orgName) setOrgName(saved.orgName);
      if (saved.projectName) setProjectName(saved.projectName);
      if (saved.projectId) setProjectId(saved.projectId);
      if (saved.tasks?.length) setTasks(saved.tasks);
      if (saved.tasksCreated) setTasksCreated(true);
      if (saved.email) setEmail(saved.email);
      if (saved.name) setName(saved.name);

      let next: StepId =
        saved.step && AUTHED_STEPS.includes(saved.step) ? saved.step : "org";
      if (storedOrg && next === "org") next = "project";
      if (saved.projectId && next === "project") next = "tasks";
      if (saved.tasksCreated && next === "tasks") next = "invite";
      setStep(next);

      try {
        const raw = localStorage.getItem("user");
        const user = raw ? JSON.parse(raw) : null;
        if (user && typeof user.hasPassword === "boolean") {
          setHasPassword(user.hasPassword);
        }
      } catch {
        /* ignore */
      }
    } else if (saved && !saved.authed && (saved.step === "account" || saved.step === "verify")) {
      setAuthed(false);
      setStep(saved.step);
      if (saved.email) setEmail(saved.email);
      if (saved.name) setName(saved.name);
      try {
        const pw = sessionStorage.getItem(WIZARD_PW_KEY);
        if (pw) setAccountPassword(pw);
      } catch {
        /* ignore */
      }
      setHasPassword(true);
      if (token) clearStaleSignupAuth();
    } else {
      if (token) clearStaleSignupAuth();
      setAuthed(false);
      setStep("account");
      setHasPassword(true);
    }

    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || finished) return;
    writeWizardState({
      step,
      authed,
      email: email.trim() || undefined,
      name: name.trim() || undefined,
      orgName: orgName.trim() || undefined,
      orgId,
      projectName: projectName.trim() || undefined,
      projectId,
      tasks,
      tasksCreated,
    });
  }, [
    ready,
    finished,
    step,
    authed,
    email,
    name,
    orgName,
    orgId,
    projectName,
    projectId,
    tasks,
    tasksCreated,
  ]);

  const goTo = (next: StepId) => {
    setError("");
    setAnimKey((k) => k + 1);
    setStep(next);
  };

  const goBack = () => {
    // After OTP, never send users back to Create account.
    if (authed) {
      const i = AUTHED_STEPS.indexOf(step as (typeof AUTHED_STEPS)[number]);
      if (i > 0) goTo(AUTHED_STEPS[i - 1]);
      return;
    }
    if (step === "verify") goTo("account");
  };

  const goNextInFlow = () => {
    const i = flow.indexOf(step);
    if (i >= 0 && i < flow.length - 1) goTo(flow[i + 1]);
  };

  const persistSession = (data: {
    token: string;
    user: Record<string, unknown>;
    organizationId?: string | null;
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
    if (data.organizationId) writeStoredOrgId(String(data.organizationId));
    else writeStoredOrgId(null);
    setHasPassword(stored.hasPassword);
    setAuthed(true);
  };

  const ensurePassword = async () => {
    if (hasPassword) return true;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    const res = await authFetch("/change-password/initial", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message || "Could not create password.");
      return false;
    }
    setHasPassword(true);
    try {
      const raw = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : {};
      localStorage.setItem("user", JSON.stringify({ ...user, hasPassword: true }));
    } catch {
      /* ignore */
    }
    return true;
  };

  const submitAccount = async () => {
    if (!name.trim() || !email.trim() || accountPassword.length < 6) {
      setError("Name, email, and a password (6+ chars) are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: name.trim(),
          email: email.trim(),
          password: accountPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Could not create your account.");
        return;
      }
      localStorage.setItem("verifyEmail", email.trim());
      try {
        sessionStorage.setItem(WIZARD_PW_KEY, accountPassword);
      } catch {
        /* ignore */
      }
      writeWizardState({
        step: "verify",
        authed: false,
        email: email.trim(),
        name: name.trim(),
      });
      toast.success(data.message || "Verification code sent");
      goTo("verify");
    } catch {
      setError("Unable to create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async (codeOverride?: string) => {
    if (otpSubmitting.current || loading) return;
    const code = codeOverride ?? otp.join("");
    const verifyEmail = localStorage.getItem("verifyEmail") || email.trim();
    let passwordForLogin = accountPassword;
    if (!passwordForLogin) {
      try {
        passwordForLogin = sessionStorage.getItem(WIZARD_PW_KEY) || "";
      } catch {
        passwordForLogin = "";
      }
    }
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
        body: JSON.stringify({ email: verifyEmail, password: passwordForLogin }),
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        setError(loginData.message || "Verified — please sign in to continue.");
        return;
      }

      localStorage.removeItem("verifyEmail");
      try {
        sessionStorage.removeItem(WIZARD_PW_KEY);
      } catch {
        /* ignore */
      }
      persistSession({
        token: loginData.token,
        user: loginData.user,
        organizationId: null,
      });
      writeStoredOrgId(null);
      clearStoredProjectId();
      setHasPassword(true);
      setAuthed(true);
      try {
        clearWizardState();
        sessionStorage.removeItem(WIZARD_PW_KEY);
      } catch {
        /* ignore */
      }
      // Account is ready — open Personal Workspace (org setup is optional later).
      window.location.href = "/dashboard";
      return;
    } catch {
      setError("Could not verify. Please try again.");
    } finally {
      otpSubmitting.current = false;
      setLoading(false);
    }
  };

  const submitOrg = async () => {
    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const pwOk = await ensurePassword();
      if (!pwOk) return;

      if (orgId) {
        goNextInFlow();
        return;
      }

      const res = await authFetch("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: orgName.trim(),
          description: "Created from WriTask starter wizard",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to create organization.");
        return;
      }

      clearStoredProjectId();
      writeStoredOrgId(data._id);
      setOrgId(data._id);
      setCurrentOrgId(data._id);
      await refreshAccess();
      goNextInFlow();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitProject = async () => {
    if (!orgId) {
      setError("Organization missing — go back a step.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (projectId) {
        goNextInFlow();
        return;
      }
      // Optional name — default keeps the rest of the wizard connected.
      const title = projectName.trim() || "First project";
      if (!projectName.trim()) setProjectName(title);

      const res = await authFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          title,
          organizationId: orgId,
          description: "Your first project from the starter wizard",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to create project.");
        return;
      }
      setProjectId(data._id);
      goNextInFlow();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitTasks = async () => {
    const titles = tasks.map((t) => t.trim()).filter(Boolean);
    if (titles.length < 1) {
      setError("Add at least one task to continue.");
      return;
    }
    if (!projectId) {
      setError("Project missing — go back a step.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (tasksCreated) {
        goNextInFlow();
        return;
      }
      const results = await Promise.all(
        titles.slice(0, 3).map((title) =>
          authFetch(`/projects/${projectId}/tasks`, {
            method: "POST",
            body: JSON.stringify({ title, status: "todo", priority: "medium" }),
          })
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        setError(data.message || "Could not create tasks.");
        return;
      }
      setTasksCreated(true);
      goNextInFlow();
    } catch {
      setError("Something went wrong creating tasks.");
    } finally {
      setLoading(false);
    }
  };

  const finishToProject = async (inviteCount: number) => {
    setFinished(true);
    clearWizardState();
    toast.success(
      inviteCount
        ? `Workspace ready · ${inviteCount} invite${inviteCount === 1 ? "" : "s"} sent`
        : "Workspace ready"
    );
    try {
      await refreshAccess();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      window.location.href = projectId ? `/projects/${projectId}` : "/dashboard";
    }, 900);
  };

  const submitInvite = async () => {
    if (!orgId) {
      setError("Organization missing — restart setup.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = invites.filter((i) => i.email.trim());
      for (const row of rows) {
        const emailValidationError = getEmailValidationError(row.email);
        if (emailValidationError) {
          setError(`${emailValidationError} (${row.email.trim() || "empty email"})`);
          setLoading(false);
          return;
        }

        const res = await authFetch(`/organizations/${orgId}/invite`, {
          method: "POST",
          body: JSON.stringify({
            email: row.email.trim().toLowerCase(),
            role: row.role,
            department: row.department,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || `Failed to invite ${row.email}`);
          setLoading(false);
          return;
        }
      }
      await finishToProject(rows.length);
    } catch {
      setError("Could not send invitations.");
    } finally {
      setLoading(false);
    }
  };

  const onNext = async (e?: FormEvent) => {
    e?.preventDefault();
    if (step === "verify") return; // OTP auto-advances when complete
    if (step === "account") return submitAccount();
    if (step === "org") return submitOrg();
    if (step === "project") return submitProject();
    if (step === "tasks") return submitTasks();
    if (step === "invite") return submitInvite();
  };

  const onOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      // Paste support: fill all boxes and auto-verify.
      const chars = cleaned.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, i) => {
        next[i] = c;
      });
      setOtp(next);
      if (chars.length === 6) void submitVerify(chars.join(""));
      else otpRefs.current[chars.length]?.focus();
      return;
    }

    const digit = cleaned.slice(-1);
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

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#EEF2F7] text-slate-500">
        <Loader2 className="animate-spin text-cyan-600" size={28} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="ob-root">
        <div className="ob-stage">
          <div className="ob-finish">
            <div className="ob-finish-orb">
              <Check size={30} />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">You’re all set</h2>
            <p className="mt-2 text-slate-500">Taking you to your project…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-root">
      <div className="ob-stage">
        <div className="ob-split">
          <section className="ob-form-col">
            <Link href="/home" className="ob-brand">
              <Logo className="h-[2.15rem] w-[2.15rem]" staysLight />
              WriTask
            </Link>

            <form
              className="ob-form-body"
              key={`${step}-${animKey}`}
              onSubmit={onNext}
            >
              <h1>{STEP_HEADLINE[step]}</h1>
              {error && <div className="ob-error">{error}</div>}

              {step === "account" && (
                <>
                  <div className="ob-field">
                    <label htmlFor="ob-name">Full name</label>
                    <input
                      id="ob-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      autoComplete="name"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="ob-field">
                    <label htmlFor="ob-email">Email</label>
                    <input
                      id="ob-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="ob-field">
                    <label htmlFor="ob-account-pw">Password</label>
                    <div className="ob-pw-wrap">
                      <input
                        id="ob-account-pw"
                        type={showAccountPw ? "text" : "password"}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="ob-pw-toggle"
                        aria-label={showAccountPw ? "Hide password" : "Show password"}
                        onClick={() => setShowAccountPw((v) => !v)}
                      >
                        {showAccountPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {step === "verify" && (
                <>
                  <p className="ob-hint mb-3">
                    Code sent to <strong>{email || "your email"}</strong>
                  </p>
                  <div className="ob-otp">
                    {otp.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={(e) => onOtpChange(i, e.target.value)}
                        onKeyDown={(e) => onOtpKeyDown(i, e.key)}
                        aria-label={`Digit ${i + 1}`}
                        autoFocus={i === 0}
                        disabled={loading}
                      />
                    ))}
                  </div>
                  {loading ? (
                    <p className="ob-hint flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Verifying…
                    </p>
                  ) : (
                    <p className="ob-hint"></p>
                  )}
                </>
              )}

              {step === "org" && (
                <>
                  {!hasPassword && (
                    <>
                      <div className="ob-field">
                        <label htmlFor="ob-password">Create password</label>
                        <div className="ob-pw-wrap">
                          <input
                            id="ob-password"
                            type={showOrgPw ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="ob-pw-toggle"
                            aria-label={showOrgPw ? "Hide password" : "Show password"}
                            onClick={() => setShowOrgPw((v) => !v)}
                          >
                            {showOrgPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                      <div className="ob-field">
                        <label htmlFor="ob-confirm">Confirm password</label>
                        <div className="ob-pw-wrap">
                          <input
                            id="ob-confirm"
                            type={showOrgConfirmPw ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="Repeat password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="ob-pw-toggle"
                            aria-label={
                              showOrgConfirmPw ? "Hide password" : "Show password"
                            }
                            onClick={() => setShowOrgConfirmPw((v) => !v)}
                          >
                            {showOrgConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="ob-field">
                    <label htmlFor="ob-org">Organization name</label>
                    <input
                      id="ob-org"
                      type="text"
                      placeholder="e.g. Acme Studio"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </>
              )}

              {step === "project" && (
                <div className="ob-field">
                  <label htmlFor="ob-project">Project name </label>
                  <input
                    id="ob-project"
                    type="text"
                    placeholder="e.g. First project"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    autoFocus
                  />
                  
                </div>
              )}

              {step === "tasks" && (
                <>
                  {tasks.map((task, index) => (
                    <div className="ob-field" key={index}>
                      <label htmlFor={`ob-task-${index}`}>Task {index + 1}</label>
                      <input
                        id={`ob-task-${index}`}
                        type="text"
                        value={task}
                        placeholder={
                          index === 0
                            ? "e.g. Kick off project planning"
                            : index === 1
                              ? "e.g. Define roles"
                              : "e.g. Schedule team sync"
                        }
                        onChange={(e) => {
                          const next = [...tasks];
                          next[index] = e.target.value;
                          setTasks(next);
                        }}
                        autoFocus={index === 0}
                      />
                    </div>
                  ))}
                  
                </>
              )}

              {step === "invite" && (
                <>
                  <div className="ob-invite-list">
                    {invites.map((row, index) => (
                      <div className="ob-invite-card" key={index}>
                        <div className="ob-invite-grid">
                          <div className="ob-field mb-0">
                            <label>Email</label>
                            <input
                              type="email"
                              placeholder="teammate@company.com"
                              value={row.email}
                              onChange={(e) => {
                                const next = [...invites];
                                next[index] = { ...row, email: e.target.value };
                                setInvites(next);
                              }}
                              autoFocus={index === 0}
                            />
                          </div>
                          <div className="ob-field mb-0">
                            <label>Role</label>
                            <Select
                              className="w-full"
                              value={row.role}
                              options={ROLE_OPTIONS}
                              triggerClassName={obSelectTrigger}
                              menuClassName="ob-select-menu min-w-[160px]"
                              onChange={(value) => {
                                const next = [...invites];
                                next[index] = { ...row, role: value };
                                setInvites(next);
                              }}
                            />
                          </div>
                          <div className="ob-field mb-0">
                            <label>Department</label>
                            <Select
                              className="w-full"
                              value={row.department}
                              options={DEPARTMENT_SELECT_OPTIONS}
                              triggerClassName={obSelectTrigger}
                              menuClassName="ob-select-menu min-w-[180px]"
                              onChange={(value) => {
                                const next = [...invites];
                                next[index] = { ...row, department: value };
                                setInvites(next);
                              }}
                            />
                          </div>
                          {invites.length > 1 && (
                            <button
                              type="button"
                              className="ob-btn-link"
                              onClick={() =>
                                setInvites((rows) => rows.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2 size={14} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {invites.length < 5 && (
                    <button
                      type="button"
                      className="ob-btn-link mt-2"
                      onClick={() => setInvites((rows) => [...rows, emptyInvite()])}
                    >
                      <Plus size={14} /> Add another
                    </button>
                  )}
                </>
              )}
            </form>

            <p className="ob-login-link">
              Already have an account? <Link href="/login">Login</Link>
            </p>
          </section>

          <LivePreview
            step={step}
            orgName={orgName}
            projectName={projectName}
            tasks={tasks}
            invites={invites}
          />
        </div>

        <footer className="ob-footer">
          <div className="ob-footer-left">
            {canGoBack ? (
              <button
                type="button"
                className="ob-btn ob-btn-ghost"
                onClick={goBack}
                disabled={loading}
              >
                <ArrowLeft size={16} /> Back
              </button>
            ) : null}
          </div>

          <div className="ob-dots" aria-label={`Step ${stepIndex + 1} of ${flow.length}`}>
            {flow.map((id, i) => (
              <span
                key={id}
                className={`ob-dot ${i === stepIndex ? "is-on" : ""} ${
                  i < stepIndex ? "is-done" : ""
                }`}
              />
            ))}
          </div>

          <div className="ob-footer-right">
            {step === "invite" && (
              <button
                type="button"
                className="ob-btn ob-btn-ghost mr-2"
                onClick={() => void finishToProject(0)}
                disabled={loading}
              >
                Skip
              </button>
            )}
            {step !== "verify" && (
              <button
                type="button"
                className="ob-btn ob-btn-primary"
                onClick={() => void onNext()}
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {step === "invite" ? "Finish" : "Next"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
