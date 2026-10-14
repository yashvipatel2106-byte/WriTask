export default function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#F6F9FC] dark:bg-slate-950"
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-200 border-t-cyan-600 dark:border-slate-700 dark:border-t-cyan-400" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
