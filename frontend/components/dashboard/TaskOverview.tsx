"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/components/context/organizationContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchTaskOverview } from "@/store/slices/dashboardSlice";
import {
  selectTaskOverview,
  selectTaskOverviewLoading,
} from "@/store/selectors/dashboardSelectors";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ClipboardList } from "lucide-react";

const CORE_STATUSES = [
  { id: "completed", label: "Completed", color: "#22C55E" },
  { id: "in-progress", label: "In Progress", color: "#A855F7" },
  { id: "review", label: "Review", color: "#F59E0B" },
  { id: "todo", label: "To Do", color: "#EAB308" },
];

const CUSTOM_COLORS = [
  "#06B6D4",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#8B5CF6",
  "#64748B",
];

type SliceInfo = { name: string; value: number; color: string; total: number };

/** Hover detail card — rendered outside the ring (below it) instead of as a
 * recharts <Tooltip>, whose default anchor sits at the pie's centre and
 * collided with the "Total Tasks" centre label. */
const SliceDetailCard = ({ name, value, color, total }: SliceInfo) => {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1 pl-4.5 dark:text-slate-400">
        {value} tasks &middot; {percent}%
      </p>
    </div>
  );
};

export default function TaskOverview() {
  const dispatch = useAppDispatch();
  const { currentOrgId, orgReady } = useOrganization();
  const orgId = currentOrgId ?? null;

  const overview = useAppSelector(selectTaskOverview);
  const loading = useAppSelector(selectTaskOverviewLoading);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // 30s polling refresh (initial load handled by dashboard page)
  useEffect(() => {
    if (!orgReady) return;

    const interval = setInterval(() => {
      dispatch(fetchTaskOverview(orgId));
    }, 30_000);

    return () => clearInterval(interval);
  }, [dispatch, orgId, orgReady]);

  const coreChartData = [
    { name: "Completed", value: overview.completed, color: "#22C55E" },
    { name: "In Progress", value: overview.inProgress, color: "#A855F7" },
    { name: "Review", value: overview.review, color: "#F59E0B" },
    { name: "To Do", value: overview.todo, color: "#EAB308" },
  ];

  const customChartData = overview.customStatuses.map((cs, i) => ({
    name: cs.label,
    value: cs.count,
    color: CUSTOM_COLORS[i % CUSTOM_COLORS.length],
  }));

  const chartData = [...coreChartData, ...customChartData].filter((d) => d.value > 0);
  const totalValue = chartData.reduce((sum, d) => sum + d.value, 0);
  const displayData =
    chartData.length > 0
      ? chartData.map((d) => ({ ...d, total: totalValue }))
      : [{ name: "No tasks", value: 1, color: "#E2E8F0", total: 1 }];

  if (!orgReady) {
    return (
      <div className="dashboard-widget h-full flex items-center justify-center min-h-[260px]">
        <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 h-full dark:bg-slate-900 dark:border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/10">
            <ClipboardList size={18} className="text-violet-600 dark:text-violet-400" />
          </span>
          Task Overview
        </h2>
        {loading && (
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      <div className="relative w-full min-w-0">
        {/* Donut chart — height 260px, cy=50% → SVG centre at 130px from top */}
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="46%"
              innerRadius={68}
              outerRadius={94}
              paddingAngle={displayData.length > 1 ? 3 : 0}
              cornerRadius={8}
              dataKey="value"
              stroke="none"
              labelLine={false}
              isAnimationActive={true}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {displayData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.35}
                  style={{
                    filter:
                      activeIndex === index
                        ? `drop-shadow(0 4px 10px ${entry.color}80)`
                        : "none",
                    transition: "opacity 200ms ease, filter 200ms ease",
                    cursor: "pointer",
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* FIX: centre text vertically aligned — chart 260px, cy 50% = 130px centre.
            Always visible — the hover detail card renders below the ring
            (see SliceDetailCard below), not at the centre, so it never
            competes with this label. */}
        <div className="absolute left-1/2 top-[105px] -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-4xl font-bold text-slate-800 leading-none tabular-nums dark:text-slate-100">
            {overview.totalTasks}
          </span>
          <span className="text-slate-400 text-[11px] font-semibold mt-1 uppercase tracking-wide dark:text-slate-500">
            Total Tasks
          </span>
        </div>

        {/* Hover detail card — anchored just below the ring's outer edge
            (outerRadius 94 from a cy at 46% of the 300px chart ≈ 232px down),
            not at the centre, so it never overlaps the ring or the total. */}
        {activeIndex !== null && (
          <div className="absolute left-1/2 top-[236px] -translate-x-1/2 z-10 pointer-events-none">
            <SliceDetailCard {...displayData[activeIndex]} />
          </div>
        )}

        {/* Legend — scrolls internally once there are more than 5 statuses,
            instead of pushing the card taller indefinitely. */}
        <div
          className={`mt-3 space-y-3 px-2 pb-2 ${
            CORE_STATUSES.length + overview.customStatuses.length > 5
              ? "max-h-[220px] overflow-y-auto pr-1"
              : ""
          }`}
        >

          {/* Core statuses — always shown */}
          {CORE_STATUSES.map((s) => {
            const count =
              s.id === "completed"   ? overview.completed  :
              s.id === "in-progress" ? overview.inProgress :
              s.id === "review"      ? overview.review     :
              overview.todo;
            const percent = totalValue ? Math.round((count / totalValue) * 100) : 0;
            return (
              <div key={s.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="text-sm text-slate-800 font-semibold tabular-nums dark:text-slate-100">
                    {count}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percent}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            );
          })}

          {/* Custom statuses — auto-appear when added in Kanban, auto-disappear when removed */}
          {overview.customStatuses.map((cs, i) => {
            const color = CUSTOM_COLORS[i % CUSTOM_COLORS.length];
            const percent = totalValue ? Math.round((cs.count / totalValue) * 100) : 0;
            return (
              <div key={cs.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {cs.label}
                  </span>
                  <span className="text-sm text-slate-800 font-semibold tabular-nums dark:text-slate-100">
                    {cs.count}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percent}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}
