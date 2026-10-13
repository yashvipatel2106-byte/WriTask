"use client";

import { useOrganization } from "@/components/context/organizationContext";
import { useEffect, useState } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import { useAppSelector } from "@/store/hooks";
import {
  selectProjectProgress,
  selectProjectProgressLoading,
} from "@/store/selectors/dashboardSelectors";
import { apiUrl } from "@/lib/validation/api";
import { TrendingUp } from "lucide-react";

export default function ProjectProgress() {
  const { currentOrg } = useOrganization();
  const [data, setData] = useState<any[]>([]);
useEffect(() => {
  const token = localStorage.getItem("token");

  const path = currentOrg?.organizationId
    ? `/dashboard/project-progress?organizationId=${currentOrg.organizationId}`
    : "/dashboard/project-progress?personal=true";

  fetch(apiUrl(path), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then((res) => res.json())
    .then((result) => {

      setData(
        Array.isArray(result)
          ? result
          : []
      );
    })
    .catch(console.error);
}, [currentOrg]);

  const avgProgress = data.length
    ? Math.round(
        data.reduce((sum, d) => sum + (d.progress || 0), 0) / data.length
      )
    : 0;

  const ProgressTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload.find((p: any) => p.dataKey === "progress");
    if (!entry) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-2.5 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900/95">
        <p className="text-xs font-semibold text-slate-500 mb-1 truncate max-w-[180px] dark:text-slate-400">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {entry.value}% complete
          </span>
        </div>
      </div>
    );
  };

    const isCrowded = data.length > 5;
    const chartMinWidth = isCrowded ? data.length * 130 : undefined;

    return (
  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 h-full flex flex-col dark:bg-slate-900 dark:border-slate-800">
    <div className="flex justify-between items-center mb-5 shrink-0">
      <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/10">
          <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />
        </span>
        Project Progress
      </h2>

      <div className="flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3.5 py-1.5 dark:bg-blue-500/10 dark:border-blue-400/20">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
          {avgProgress}% avg
        </span>
      </div>
    </div>

   <div className="w-full flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
     <div
       className="h-full"
       style={{ minWidth: chartMinWidth ? `${chartMinWidth}px` : "100%" }}
     >
  <ResponsiveContainer width="100%" height="90%">
        <BarChart
  data={data}
  barCategoryGap={isCrowded ? "20%" : "32%"}
  margin={{
    top: 24,
    right: 16,
    left: 0,
    bottom: 10,
  }}
>
  <defs>
    <linearGradient id="progressBarGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#60A5FA" />
      <stop offset="100%" stopColor="#2563EB" />
    </linearGradient>
  </defs>

  <CartesianGrid
    strokeDasharray="3 3"
    stroke="#E2E8F0"
    vertical={false}
  />

 <XAxis
  dataKey="projectName"
  tick={{ fill: "#64748B", fontSize: 13 }}
  tickLine={false}
  axisLine={{ stroke: "#E2E8F0" }}
  interval={0}
  dy={10}
  tickFormatter={(value: string) =>
    value.length > 12 ? `${value.slice(0, 12)}…` : value
  }
/>

  <YAxis
  domain={[0, 100]}
  tick={{ fill: "#64748B", fontSize: 13 }}
  tickLine={false}
  axisLine={{ stroke: "#E2E8F0" }}
  tickFormatter={(value) => `${value}%`}
  width={48}
/>


  <Tooltip
  cursor={{ fill: "var(--surface-muted)" }}
  content={<ProgressTooltip />}
/>
  <Bar
  dataKey="progress"
  radius={[10, 10, 0, 0]}
  fill="url(#progressBarGradient)"
  barSize={64}
  activeBar={{ fill: "#2563EB" }}
>
  <LabelList
    dataKey="progress"
    position="top"
    formatter={(value: any) => `${value}%`}
    style={{ fill: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}
  />
</Bar>
</BarChart>
      </ResponsiveContainer>
    </div>
   </div>
  </div>
);
}