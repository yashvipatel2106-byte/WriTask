"use client";

import { NOTIFICATION_INBOX_FEATURE_SHEET } from "@/lib/notifications";

function Cell({ value }: { value: boolean | "partial" }) {
  if (value === true) {
    return <span className="text-emerald-400 font-medium">Yes</span>;
  }
  if (value === "partial") {
    return <span className="text-amber-300 font-medium">Partial</span>;
  }
  return <span className="text-gray-600">—</span>;
}

export default function NotificationFeatureSheet({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-cyan-500/15 bg-[#07153D]/60 overflow-hidden ${
        compact ? "" : "mb-6"
      }`}
    >
      <div className="px-4 py-3 border-b border-cyan-500/10">
        <h3 className="text-sm font-semibold text-white">
          Notifications vs Inbox — feature sheet
        </h3>
        {!compact && (
          <p className="text-xs text-gray-500 mt-1">
            Bell = quick alerts. Inbox = full work queue. Both use the same data.
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Feature</th>
              <th className="px-4 py-2.5 font-medium w-28">Bell</th>
              <th className="px-4 py-2.5 font-medium w-28">Inbox</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_INBOX_FEATURE_SHEET.map((row) => (
              <tr
                key={row.feature}
                className="border-t border-cyan-500/10 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-2.5 text-gray-300">{row.feature}</td>
                <td className="px-4 py-2.5">
                  <Cell value={row.notifications} />
                </td>
                <td className="px-4 py-2.5">
                  <Cell value={row.inbox} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
