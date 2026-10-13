"use client";

import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AccountInfoPage() {
  const router = useRouter();
  const { user, loading, profileReady } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  const designation =
    user?.profileMeta?.isOrgOwner ? "admin" : user?.designation || "—";

  if (loading && !profileReady) {
    return (
      <div className="text-slate-500 dark:text-slate-400">
        Loading account information...
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">
        Account info
      </h1>
      <p className="text-slate-500 mb-8 dark:text-slate-400">
        Your personal account details.
      </p>

      <section className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
          Your account
        </h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Name</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">
              {user?.username || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">
              {user?.email || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">
              {user?.phone || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Country</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">
              {user?.location || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Designation</dt>
            <dd className="text-slate-900 mt-1 capitalize wrap-break-word dark:text-slate-100">
              {designation}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500 dark:text-slate-400">Department</dt>
            <dd className="text-slate-900 mt-1 wrap-break-word dark:text-slate-100">
              {user?.department || "—"}
            </dd>
          </div>
        </dl>
        <Link
          href="/profile/edit"
          className="inline-block mt-5 text-cyan-700 text-sm hover:underline dark:text-cyan-400"
        >
          Edit profile details
        </Link>
      </section>
    </div>
  );
}
