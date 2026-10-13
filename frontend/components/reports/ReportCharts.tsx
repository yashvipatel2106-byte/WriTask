"use client";

export type WeeklyActivityItem = {
  day: string;
  date: string;
  completed: number;
  pending: number;
};

export const EMPTY_WEEKLY: WeeklyActivityItem[] = [
  { day: "Mon", date: "", completed: 0, pending: 0 },
  { day: "Tue", date: "", completed: 0, pending: 0 },
  { day: "Wed", date: "", completed: 0, pending: 0 },
  { day: "Thu", date: "", completed: 0, pending: 0 },
  { day: "Fri", date: "", completed: 0, pending: 0 },
  { day: "Sat", date: "", completed: 0, pending: 0 },
  { day: "Sun", date: "", completed: 0, pending: 0 },
];

export const STATUS_STYLES: Record<string, string> = {
  "On Track": "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  "At Risk": "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  Delayed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export type Period = "7d" | "30d" | "90d";

export type ProjectBreakdownItem = {
  _id: string;
  name: string;
  organizationName?: string;
  progress: number;
  tasks: number;
  done: number;
  pending: number;
  overdue: number;
  status: string;
};

export function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex gap-1 bg-white border border-slate-200 shadow-sm rounded-xl p-1 dark:bg-slate-900 dark:border-slate-700">
      {(["7d", "30d", "90d"] as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            period === p
              ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function BarChartWidget({ data }: { data: WeeklyActivityItem[] }) {
  const max = Math.max(...data.map((d) => d.completed + d.pending), 1);
  return (
    <div className="flex items-end gap-2 h-36">
      {data.map((d) => {
        const compH = max > 0 ? (d.completed / max) * 100 : 0;
        const pendH = max > 0 ? (d.pending / max) * 100 : 0;
        return (
          <div key={d.date || d.day} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full flex flex-col-reverse gap-0.5"
              style={{ height: "110px" }}
            >
              <div
                className="w-full rounded-t bg-cyan-500/70 hover:bg-cyan-400 transition-colors"
                style={{ height: `${compH}%` }}
                title={`${d.completed} completed, ${d.pending} pending`}
              />
              <div
                className="w-full rounded-t bg-violet-500/50 hover:bg-violet-400 transition-colors"
                style={{ height: `${pendH}%` }}
                title={`${d.pending} pending`}
              />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  completed,
  pending,
  overdue,
}: {
  completed: number;
  pending: number;
  overdue: number;
}) {
  const total = completed + pending + overdue || 1;
  const r = 40;
  const cx = 60;
  const cy = 60;
  const stroke = 14;
  const circ = 2 * Math.PI * r;

  const slices = [
    { value: completed, color: "#22d3ee", label: "Completed" },
    { value: pending, color: "#8b5cf6", label: "Pending" },
    { value: overdue, color: "#f87171", label: "Overdue" },
  ];

  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={stroke + 2}
        />
        {slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "60px 60px",
              }}
            />
          );
          offset += len;
          return el;
        })}
        <text
          x={cx}
          y={cy}
          dominantBaseline="middle"
          textAnchor="middle"
          className="fill-slate-900 dark:fill-slate-100"
          fontSize="14"
          fontWeight="bold"
        >
          {completed + pending + overdue}
        </text>
      </svg>
      <div className="space-y-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
            <span className="text-slate-900 font-semibold ml-auto pl-4 dark:text-slate-100">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
