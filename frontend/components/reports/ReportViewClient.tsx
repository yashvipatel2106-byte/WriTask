"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Pencil } from "lucide-react";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import { toast } from "@/components/ui/toast";
import { downloadReportExport, fetchReportRows } from "@/lib/reports/api";
import type { ReportData, SavedReport } from "@/lib/reports/types";
import ReportResultsTable from "@/components/reports/ReportResultsTable";

export default function ReportViewClient({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [report, setReport] = useState<SavedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    fetchReportRows(reportId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setReport(result.report || null);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to generate report.");
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const handleExport = async (kind: "excel" | "pdf") => {
    setExporting(kind);
    try {
      const name = report?.title || "report";
      await downloadReportExport(
        reportId,
        kind,
        kind === "excel" ? `${name}.xlsx` : `${name}.pdf`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to export report.");
    } finally {
      setExporting(null);
    }
  };

  const columns = data?.columns || [];
  const rows = data?.rows || [];

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto bg-[#F6F9FC] text-slate-900 p-6 sm:p-10 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/reports" className="text-sm text-cyan-700 dark:text-cyan-400">
                ← Reports
              </Link>
              <h1 className="mt-2 text-3xl font-bold">
                {report?.title || "Report"}
              </h1>
              {report?.workspaceName && (
                <p className="text-sm text-slate-500 mt-1">
                  {report.workspaceName}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {report?.canEdit && (
                <Link href={`/reports/${reportId}/edit`} className="btn btn-secondary">
                  <Pencil size={15} /> Edit
                </Link>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={exporting !== null || loading}
                onClick={() => void handleExport("excel")}
              >
                <Download size={15} />
                {exporting === "excel" ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={exporting !== null || loading}
                onClick={() => void handleExport("pdf")}
              >
                <FileText size={15} />
                {exporting === "pdf" ? "Preparing…" : "Download PDF"}
              </button>
            </div>
          </div>

          <div className="dashboard-widget overflow-x-auto">
            {loading ? (
              <p className="py-16 text-center text-slate-400">Generating report…</p>
            ) : !reportId ? (
              <p className="py-16 text-center text-red-600 dark:text-red-400">Invalid report.</p>
            ) : error ? (
              <p className="py-16 text-center text-red-600 dark:text-red-400">{error}</p>
            ) : columns.length === 0 ? (
              <p className="py-16 text-center text-slate-400">
                Please select at least one column.
              </p>
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-slate-400">
                No data found for the selected filters.
              </p>
            ) : (
              <ReportResultsTable
                columns={columns}
                rows={rows}
                hierarchical={
                  (data?.basedOn || report?.basedOn) !== "time_entries"
                }
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
