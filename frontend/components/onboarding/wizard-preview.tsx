"use client";

import { Home, Bell, FolderKanban, ListChecks, UserPlus, CheckCircle2 } from "lucide-react";

type PreviewKey = "account" | "project" | "task" | "invite";

const NAV_ITEMS = [
  { icon: Home, label: "Home" },
  { icon: Bell, label: "Inbox" },
];

function AccountPreview() {
  return (
    <>
      <div className="wz-preview-header">Welcome to WriTask</div>
      <div className="wz-preview-tabs">
        <span className="is-active">Table</span>
        <span>Gantt</span>
        <span>Board</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[70, 45, 85].map((w, i) => (
          <div key={i} style={{ height: 12, width: `${w}%`, borderRadius: 6, background: "#f1f5f9" }} />
        ))}
      </div>
    </>
  );
}

function ProjectPreview() {
  return (
    <>
      <div className="wz-preview-header">First project</div>
      <div className="wz-preview-tabs">
        <span>Table</span>
        <span className="is-active">Gantt</span>
        <span>Board</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 8, width: "60%", borderRadius: 6, background: "#bbf7d0" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ height: 22, width: "35%", borderRadius: 6, background: "#a7f3d0" }} />
          <span style={{ fontSize: 11, color: "#111827", fontWeight: 600 }}>Design phase</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "20%" }}>
          <div style={{ height: 22, width: "40%", borderRadius: 6, background: "#93c5fd" }} />
          <span style={{ fontSize: 11, color: "#111827", fontWeight: 600 }}>Build phase</span>
        </div>
      </div>
    </>
  );
}

function TaskPreview() {
  const rows = ["Draft homepage wireframes", "Review copy", "Set up analytics"];
  return (
    <>
      <div className="wz-preview-header">Tasks</div>
      <div className="wz-preview-tabs">
        <span className="is-active">Table</span>
        <span>Gantt</span>
        <span>Board</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={14} color={i === 0 ? "#0e6e56" : "#d1d5db"} />
            <span style={{ fontSize: 12, color: i === 0 ? "#111827" : "#9ca3af" }}>{r}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function InvitePreview() {
  const people = ["JD", "AS", "MK"];
  return (
    <>
      <div className="wz-preview-header">Team</div>
      <div className="wz-preview-tabs">
        <span>Table</span>
        <span>Gantt</span>
        <span className="is-active">Board</span>
      </div>
      <div style={{ display: "flex", gap: -6 }}>
        {people.map((p, i) => (
          <div
            key={p}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: ["#0e6e56", "#3b82f6", "#f59e0b"][i],
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: i === 0 ? 0 : -8,
              border: "2px solid #fff",
            }}
          >
            {p}
          </div>
        ))}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            background: "#f1f5f9",
            border: "2px dashed #d1d5db",
            marginLeft: -8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserPlus size={13} color="#9ca3af" />
        </div>
      </div>
    </>
  );
}

const PREVIEWS: Record<PreviewKey, { Icon: React.ElementType; content: React.ReactNode; navLabel: string }> = {
  account: { Icon: Home, content: <AccountPreview />, navLabel: "First space" },
  project: { Icon: FolderKanban, content: <ProjectPreview />, navLabel: "First space" },
  task: { Icon: ListChecks, content: <TaskPreview />, navLabel: "First space" },
  invite: { Icon: UserPlus, content: <InvitePreview />, navLabel: "First space" },
};

export default function WizardPreview({ step }: { step: PreviewKey }) {
  const { content, navLabel } = PREVIEWS[step];
  return (
    <div className="wz-preview-card">
      <div className="wz-preview-sidebar">
        <div className="wz-preview-brand">
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "#0e6e56",
              display: "inline-block",
            }}
          />
          WriTask
        </div>
        {NAV_ITEMS.map((item) => (
          <div key={item.label} className="wz-preview-nav-item">
            <item.icon />
            {item.label}
          </div>
        ))}
        <div style={{ height: 1, background: "#1e293b", margin: "10px 0" }} />
        <div className="wz-preview-nav-item is-active">{navLabel}</div>
      </div>
      <div className="wz-preview-main">{content}</div>
    </div>
  );
}
