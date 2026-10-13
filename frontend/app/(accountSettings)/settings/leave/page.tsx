"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/components/context/organizationContext";
import { toast } from "@/components/ui/toast";
import Select from "@/components/ui/Select";
import ThemedDatePicker from "@/components/ui/ThemedDatePicker";
import { avatarBg, avatarInitials } from "@/lib/avatarColor";
import {
  applyLeave,
  fetchMyLeaves,
  fetchPendingApprovals,
  decideLeave,
  type LeaveRequestAPI,
  type LeaveType,
} from "@/lib/validation/leaveApi";

const LEAVE_TYPES: LeaveType[] = ["Casual", "Sick", "Other"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20 dark:focus:border-cyan-500";

const labelCls = "text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block dark:text-slate-400";

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const PAGE_SIZE = 5;

function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Previous
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Next
      </button>
    </div>
  );
}

function DecisionRow({ leave, onDecide }: { leave: LeaveRequestAPI; onDecide: (id: string, status: "approved" | "rejected", remarks: string) => Promise<void> }) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  const act = async (status: "approved" | "rejected") => {
    setBusy(status);
    try {
      await onDecide(leave._id, status, remarks);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0 uppercase ${avatarBg(leave.employee.avatarColor, leave.employee._id).className}`}
            style={avatarBg(leave.employee.avatarColor, leave.employee._id).style}
          >
            {avatarInitials(leave.employee.username)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{leave.employee.username}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {leave.leaveType} · {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 capitalize ${STATUS_STYLES[leave.status]}`}>
          {leave.status}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">{leave.reason}</p>
      {leave.status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            className={inputCls + " flex-1 min-w-[160px] py-2"}
            placeholder="Remarks (optional)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("approved")}
            className="btn btn-success btn-sm disabled:opacity-50"
          >
            {busy === "approved" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("rejected")}
            className="btn btn-danger btn-sm disabled:opacity-50"
          >
            {busy === "rejected" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}
      {leave.status !== "pending" && leave.remarks && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Remarks: {leave.remarks}</p>
      )}
    </div>
  );
}

export default function ApplyLeavePage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.organizationId || "";
  const isApprover = currentOrg?.role === "owner" || currentOrg?.role === "manager";

  const [myLeaves, setMyLeaves] = useState<LeaveRequestAPI[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<LeaveRequestAPI[]>([]);
  const [myPage, setMyPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    leaveType: "Casual" as LeaveType,
    reason: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [mine, team] = await Promise.all([
        fetchMyLeaves(orgId),
        isApprover ? fetchPendingApprovals(orgId, "all") : Promise.resolve([]),
      ]);
      console.log("MY LEAVES =>", mine);
      setMyLeaves(mine);
      setTeamLeaves(team);
    } catch (e: any) {
      toast.error(e.message || "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, isApprover]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reason.trim() || !form.startDate || !form.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.startDate > form.endDate) {
      toast.error("Start date must be before end date");
      return;
    }
    setSubmitting(true);
    try {
      await applyLeave(orgId, form);
      toast.success("Leave request submitted");
      setForm((f) => ({ ...f, reason: "", startDate: "", endDate: "" }));
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const teamPageClamped = Math.min(teamPage, Math.max(1, Math.ceil(teamLeaves.length / PAGE_SIZE)));
  const myPageClamped = Math.min(myPage, Math.max(1, Math.ceil(myLeaves.length / PAGE_SIZE)));

  const handleDecide = async (leaveId: string, status: "approved" | "rejected", remarks: string) => {
    try {
      await decideLeave(orgId, leaveId, { status, remarks });
      toast.success(status === "approved" ? "Leave approved" : "Leave rejected");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to update leave request");
    }
  };

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">Apply Leave</h1>
      <p className="text-slate-500 mb-8 dark:text-slate-400">
        Request time off and track the status of your leave requests.
      </p>

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">New request</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>Reason</label>
            <textarea
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="What's the reason for your leave?"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <div>
            <label className={labelCls}>Leave Type</label>
            <Select
              value={form.leaveType}
              onChange={(v) => setForm((f) => ({ ...f, leaveType: v as LeaveType }))}
              options={LEAVE_TYPES.map((t) => ({ value: t, label: t }))}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start Date</label>
              <ThemedDatePicker
                value={form.startDate}
                onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
              />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <ThemedDatePicker
                value={form.endDate}
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
              />
            </div>
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary disabled:opacity-60">
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </section>

      {isApprover && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Team Leave History</h2>
          <p className="text-sm text-slate-500 -mt-2 mb-4 dark:text-slate-400">
            Every leave request from every member of this organization — pending ones can be decided here.
          </p>
          {loading ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
          ) : teamLeaves.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No leave requests have been made yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {teamLeaves
                  .slice((teamPageClamped - 1) * PAGE_SIZE, teamPageClamped * PAGE_SIZE)
                  .map((leave) => (
                    <DecisionRow key={leave._id} leave={leave} onDecide={handleDecide} />
                  ))}
              </div>
              <Pagination page={teamPageClamped} total={teamLeaves.length} onChange={setTeamPage} />
            </>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">My Leave History</h2>
        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : myLeaves.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">You haven't applied for any leave yet.</p>
        ) : (
          <>
            <div className="space-y-3">
              {myLeaves
                .slice((myPageClamped - 1) * PAGE_SIZE, myPageClamped * PAGE_SIZE)
                .map((leave) => (
                  <div
                    key={leave._id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{leave.leaveType}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_STYLES[leave.status]}`}>
                          {leave.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDate(leave.startDate)} – {formatDate(leave.endDate)} · Applied {formatDate(leave.createdAt)}
                      </p>
                      {leave.approvedBy && leave.approvalDate && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {leave.status === "approved" ? "Approved" : "Rejected"} by {leave.approvedBy.username} on {formatDate(leave.approvalDate)}
                        </p>
                      )}
                      {leave.remarks && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Remarks: {leave.remarks}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <Pagination page={myPageClamped} total={myLeaves.length} onChange={setMyPage} />
          </>
        )}
      </section>
    </div>
  );
}
