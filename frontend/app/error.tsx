"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F6F9FC] p-6 text-center dark:bg-slate-950">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
        An unexpected error occurred. You can try again, and if the problem
        continues please reload the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-cyan-600 px-6 py-3 font-medium text-white transition-colors hover:bg-cyan-700"
      >
        Try again
      </button>
    </div>
  );
}
