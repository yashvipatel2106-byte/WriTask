"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
} from "lucide-react";

import Select from "@/components/ui/Select";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

import {
  fetchRequestForms,
  type RequestForm,
} from "@/lib/requestForms";

import { toast } from "@/components/ui/toast";

export default function RequestFormsPage() {
  const router = useRouter();

  const {
    currentOrg,
    orgReady,
  } = useOrganization();

  const { can, canManageRequestForms } = useOrgPermission();

  const canSubmit = can("requestForm:submit");
  const canManage = canManageRequestForms;
  const canReview = can("requestForm:review");

  const [forms, setForms] = useState<RequestForm[]>(
    []
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(
    null
  );

  const [refreshing, setRefreshing] =
    useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"created" | "name" | "edited">(
    "created"
  );

  /*
   * Load Request Forms for the currently
   * selected organization.
   */
  const loadForms = async (
    showRefreshLoader = false
  ) => {
    if (!currentOrg?.organizationId) {
      setForms([]);
      setLoading(false);
      return;
    }

    if (showRefreshLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const data = await fetchRequestForms(
        currentOrg.organizationId
      );

      /*
       * The API helper normally returns an array.
       * Keep the fallback defensive so the page
       * does not break if the backend returns
       * { forms: [...] }.
       */
      let loadedForms: RequestForm[] = [];

      if (Array.isArray(data)) {
        loadedForms = data;
      } else if (
        data &&
        typeof data === "object" &&
        "forms" in data &&
        Array.isArray(
          (data as { forms?: unknown }).forms
        )
      ) {
        loadedForms =
          (data as {
            forms: RequestForm[];
          }).forms;
      }

      setForms(loadedForms);
    } catch (err) {
      console.error(
        "Failed to load request forms:",
        err
      );

      setForms([]);

      setError(
        "Failed to load request forms. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!orgReady) {
      return;
    }

    void loadForms();
  }, [
    orgReady,
    currentOrg?.organizationId,
  ]);

  /*
   * Forms are workspace-scoped — reload whenever the active
   * workspace changes (e.g. switching from Internal to a custom
   * workspace in the sidebar), not just when the organization does.
   */
  useEffect(() => {
    const onWorkspaceChange = () => void loadForms();
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () =>
      window.removeEventListener("workspace-changed", onWorkspaceChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.organizationId]);

  /*
   * Refresh forms.
   */
  const handleRefresh = async () => {
    await loadForms(true);
  };

  const visibleForms = useMemo(() => {
    const query = search.trim().toLowerCase();

    let list = forms.filter((form) => {
      if (
        statusFilter !== "all" &&
        String(form.status || "draft") !== statusFilter
      ) {
        return false;
      }

      if (!query) return true;

      return (
        form.name?.toLowerCase().includes(query) ||
        form.description?.toLowerCase().includes(query) ||
        form.createdBy?.username?.toLowerCase().includes(query)
      );
    });

    list = list.slice().sort((a, b) => {
      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "");
      }
      if (sortBy === "edited") {
        return (
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
        );
      }
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });

    return list;
  }, [forms, search, statusFilter, sortBy]);

  /*
   * No organization selected.
   */
  if (!orgReady) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-6xl">
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading organization...
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /*
   * User does not have any Request Form
   * permission.
   */
  if (
    !canSubmit &&
    !canManage &&
    !canReview
  ) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-6xl">
                <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
                  <ClipboardList
                    size={32}
                    className="mx-auto mb-3 text-red-500"
                  />

                  <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">
                    Access Denied
                  </h1>

                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    You do not have permission to
                    access Request Forms.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />

      <div className="flex h-full">
        {/* Main WriTask Sidebar */}
        <Sidebar />

        <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
          <div className="flex min-h-full w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:p-8">

            {/* Main Content */}
            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-6xl">

                {/* Back */}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/settings/organization/request-form"
                    )
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Form
                </button>

                {/* Header */}
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-500/10">
                        <ClipboardList
                          size={22}
                          className="text-cyan-600 dark:text-cyan-400"
                        />
                      </div>

                      <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                          Request Forms
                        </h1>

                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Create, manage and submit
                          organization request forms.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Refresh */}
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <RefreshCw
                        size={16}
                        className={
                          refreshing
                            ? "animate-spin"
                            : ""
                        }
                      />

                      Refresh
                    </button>

                    {/* Create */}
                    {canManage && (
                      <Link
                        href="/request-forms/create"
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700"
                      >
                        <Plus size={17} />
                        Create Request Form
                      </Link>
                    )}
                  </div>
                </div>

                {/* Organization information */}
                <div className="mb-6 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-5 py-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
                  <div className="flex items-center gap-3">
                    <Settings2
                      size={18}
                      className="shrink-0 text-cyan-600 dark:text-cyan-400"
                    />

                    <div>
                      <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">
                        Organization Request Forms
                      </p>

                      <p className="mt-0.5 text-xs text-cyan-700/80 dark:text-cyan-400/80">
                        Forms shown here belong to the
                        currently selected organization.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          Unable to load Request Forms
                        </p>

                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRefresh}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                      >
                        <RefreshCw size={16} />
                        Try Again
                      </button>
                    </div>
                  </div>
                )}

                {/* Search / Filter / Sort */}
                {!loading && !error && forms.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="relative min-w-55 flex-1">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, description, creator..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: "all", label: "All statuses" },
                        { value: "draft", label: "Draft" },
                        { value: "published", label: "Published" },
                        { value: "disabled", label: "Disabled" },
                        { value: "archived", label: "Archived" },
                      ]}
                      className="w-44"
                      triggerClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      ariaLabel="Filter by status"
                    />

                    <Select
                      value={sortBy}
                      onChange={(v) =>
                        setSortBy(v as "created" | "name" | "edited")
                      }
                      options={[
                        { value: "created", label: "Sort: Created date" },
                        { value: "edited", label: "Sort: Last edited" },
                        { value: "name", label: "Sort: Name" },
                      ]}
                      className="w-52"
                      triggerClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      ariaLabel="Sort forms"
                    />
                  </div>
                )}

                {/* Loading */}
                {loading && (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      />
                    ))}
                  </div>
                )}

                {/* Empty (no forms at all) */}
                {!loading &&
                  !error &&
                  forms.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                        <FileText
                          size={28}
                          className="text-slate-400 dark:text-slate-500"
                        />
                      </div>

                      <h2 className="mt-5 text-lg font-semibold text-slate-800 dark:text-slate-100">
                        No Request Forms yet
                      </h2>

                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                        No request forms have been created
                        for this organization yet.
                      </p>

                      {canManage && (
                        <Link
                          href="/request-forms/create"
                          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
                        >
                          <Plus size={17} />
                          Create Your First Form
                        </Link>
                      )}
                    </div>
                  )}

                {/* No results for the current search/filter */}
                {!loading &&
                  !error &&
                  forms.length > 0 &&
                  visibleForms.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      No forms match your search/filter.
                    </div>
                  )}

                {/* Forms table */}
                {!loading && !error && visibleForms.length > 0 && (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full min-w-225 text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Description</th>
                          <th className="px-4 py-3 font-semibold">Created</th>
                          <th className="px-4 py-3 font-semibold">Created by</th>
                          <th className="px-4 py-3 font-semibold">Approval</th>
                          <th className="px-4 py-3 font-semibold">Saves to</th>
                          <th className="px-4 py-3 font-semibold text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleForms.map((form) => (
                          <RequestFormRow
                            key={form._id}
                            form={form}
                            canManage={canManage}
                            canSubmit={canSubmit}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/*
 * Request Form table row
 */
function RequestFormRow({
  form,
  canManage,
  canSubmit,
}: {
  form: RequestForm;
  canManage: boolean;
  canSubmit: boolean;
}) {
  const status = String(form.status || "draft").toLowerCase();
  const isPublished = status === "published";

  const formName = form.name || "Untitled Request Form";

  const createdDate = form.createdAt
    ? new Date(form.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const savesTo = form.saveTo?.project
    ? "Fixed project"
    : "Requester chooses";

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
      <td className="px-4 py-3">
        <span
          className={[
            "inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
            isPublished
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : status === "archived"
                ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                : status === "disabled"
                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
          ].join(" ")}
        >
          {status}
        </span>
      </td>

      <td className="max-w-55 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText size={15} className="shrink-0 text-cyan-500" />
          <span className="truncate font-medium text-slate-800 dark:text-slate-100">
            {formName}
          </span>
        </div>
      </td>

      <td className="max-w-65 px-4 py-3 text-slate-500 dark:text-slate-400">
        <span className="line-clamp-1">
          {form.description || "—"}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
        {createdDate}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
        {form.createdBy?.username || form.createdBy?.email || "—"}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
        {form.approvalRequired === false ? "Not required" : "Required"}
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
        {savesTo}
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          {canSubmit && isPublished && (
            <Link
              href={`/request-forms/submit/${form._id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
            >
              <Send size={13} />
              Submit
            </Link>
          )}

          {canManage && (
            <Link
              href={`/request-forms/${form._id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Edit3 size={13} />
              Manage
            </Link>
          )}

          {!canSubmit && !canManage && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              View only
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}