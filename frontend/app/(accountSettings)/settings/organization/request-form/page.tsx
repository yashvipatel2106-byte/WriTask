"use client";

import Link from "next/link";
import {
  ClipboardList,
  Plus,
  FileText,
  Inbox,
  ArrowRight,
} from "lucide-react";

import { useOrgPermission } from "@/hooks/useOrgPermissions";

export default function OrganizationRequestFormPage() {
  const { canManageRequestForms } = useOrgPermission();

  /*
   * Permission check must be inside the component
   * because useOrgPermission is a React hook.
   */
  if (!canManageRequestForms) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          You do not have permission to manage request
          forms.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList
              size={22}
              className="text-slate-700 dark:text-slate-200"
            />

            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Request Form
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create and manage organization request forms.
          </p>
        </div>

        <Link
          href="/request-forms/create"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          <Plus size={16} />
          Create Request Form
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Manage Forms */}
        <Link
          href="/request-forms"
          className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <FileText
                size={18}
                className="text-slate-600 dark:text-slate-300"
              />
            </div>

            <ArrowRight
              size={16}
              className="text-slate-400 transition group-hover:translate-x-1"
            />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
            Manage Forms
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            View, edit, publish and manage your request forms.
          </p>
        </Link>

        {/* Requests */}
        <Link
          href="/request-forms/requests"
          className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Inbox
                size={18}
                className="text-slate-600 dark:text-slate-300"
              />
            </div>

            <ArrowRight
              size={16}
              className="text-slate-400 transition group-hover:translate-x-1"
            />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
            Requests
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Review submitted requests and their approval status.
          </p>
        </Link>

        {/* New Request Form */}
        <Link
          href="/request-forms/create"
          className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Plus
                size={18}
                className="text-slate-600 dark:text-slate-300"
              />
            </div>

            <ArrowRight
              size={16}
              className="text-slate-400 transition group-hover:translate-x-1"
            />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
            New Request Form
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Build a new form with custom questions and mappings.
          </p>
        </Link>
      </div>
    </div>
  );
}