"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

import RequestFormBuilder from "@/components/requestForms/RequestFormBuilder";
import RequestFormEmailConfigModal, {
  type RequestFormEmailConfig,
} from "@/components/requestForms/RequestFormEmailConfigModal";

import {
  fetchRequestForm,
  fetchOrganizationMembers,
  fetchRequestProjects,
  updateRequestForm,
  publishRequestForm,
  disableRequestForm,
  archiveRequestForm,
  type RequestFormSavePayload,
  type RequestForm,
  type RequestProject,
  type RequestProjectMember,
} from "@/lib/requestForms";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

export default function EditRequestFormPage() {
  const params = useParams<{ formId: string }>();
  const router = useRouter();

  const { currentOrg, orgReady } = useOrganization();
  const { canManageRequestForms } = useOrgPermission();

  const [form, setForm] = useState<RequestForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [projects, setProjects] = useState<RequestProject[]>([]);
  const [members, setMembers] = useState<RequestProjectMember[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);

  useEffect(() => {
    if (!orgReady || !currentOrg?.organizationId || !params.formId) {
      return;
    }

    const load = async () => {
      setLoading(true);

      try {
        const data = await fetchRequestForm(
          currentOrg.organizationId,
          params.formId
        );

        setForm(data);
      } catch (error) {
        console.error("Load request form error:", error);
        setForm(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [orgReady, currentOrg?.organizationId, params.formId]);

  useEffect(() => {
    if (!currentOrg?.organizationId) return;

    let cancelled = false;

    fetchRequestProjects(currentOrg.organizationId).then((data) => {
      if (!cancelled) setProjects(data);
    });

    fetchOrganizationMembers(currentOrg.organizationId).then((data) => {
      if (!cancelled) setMembers(data);
    });

    return () => {
      cancelled = true;
    };
  }, [currentOrg?.organizationId]);

  if (!orgReady || loading) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />
        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">Loading request form...</div>
        </main>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />
        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">Request Forms are available inside an organization workspace.</div>
        </main>
      </div>
    );
  }

  if (!canManageRequestForms) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />
        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget text-sm text-slate-600 dark:text-slate-300">
            You do not have permission to manage request forms.
          </div>
        </main>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />
        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">Request form not found.</div>
        </main>
      </div>
    );
  }

  const save = async (payload: RequestFormSavePayload) => {
    setSaving(true);

    try {
      const response = await updateRequestForm(
        currentOrg.organizationId,
        form._id,
        payload
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.message || "Failed to update request form.");
        return;
      }

      setForm(data);

      toast.success(
        payload.status === "published"
          ? "Request form published."
          : "Request form updated."
      );

      router.push("/request-forms");
    } catch (error) {
      console.error("Update request form error:", error);
      toast.error("Something went wrong while updating the form.");
    } finally {
      setSaving(false);
    }
  };

  const runLifecycleAction = async (
    action: "publish" | "disable" | "archive"
  ) => {
    if (!form) return;

    if (action === "archive") {
      const confirmed = await confirmDialog({
        title: "Archive this form?",
        description:
          "Archived forms stop accepting new submissions. Existing submissions remain accessible.",
        confirmLabel: "Archive",
        variant: "danger",
      });

      if (!confirmed) return;
    }

    setTransitioning(true);

    try {
      const actionFn =
        action === "publish"
          ? publishRequestForm
          : action === "disable"
            ? disableRequestForm
            : archiveRequestForm;

      const response = await actionFn(currentOrg.organizationId, form._id);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.message || `Failed to ${action} request form.`);
        return;
      }

      setForm(data);
      toast.success(`Request form ${data.status}.`);
    } catch (error) {
      console.error(`${action} request form error:`, error);
      toast.error(`Something went wrong while trying to ${action} the form.`);
    } finally {
      setTransitioning(false);
    }
  };

  const saveEmailConfig = async (emailConfig: RequestFormEmailConfig) => {
    if (!form) return;

    setSavingEmailConfig(true);

    try {
      const response = await updateRequestForm(
        currentOrg.organizationId,
        form._id,
        { emailConfig }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.message || "Failed to save email settings.");
        return;
      }

      setForm(data);
      toast.success("Thank-you email updated.");
      setEmailModalOpen(false);
    } catch (error) {
      console.error("Save email config error:", error);
      toast.error("Something went wrong while saving email settings.");
    } finally {
      setSavingEmailConfig(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />

      <div className="flex h-full">
        <Sidebar />

        <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70 h-[calc(100vh-72px)]">
          <div className="flex min-h-full w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:p-8">
            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-7xl">
                <button
                  type="button"
                  onClick={() => router.push("/request-forms")}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Forms
                </button>

                <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                      Manage Request Form
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Edit questions, mappings, conditions, and publishing settings.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                        form.status === "published"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : form.status === "archived"
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            : form.status === "disabled"
                              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
                      ].join(" ")}
                    >
                      {form.status}
                    </span>

                    {(form.status === "draft" || form.status === "disabled") && (
                      <button
                        type="button"
                        disabled={transitioning}
                        onClick={() => runLifecycleAction("publish")}
                        className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                      >
                        Publish
                      </button>
                    )}

                    {form.status === "published" && (
                      <button
                        type="button"
                        disabled={transitioning}
                        onClick={() => runLifecycleAction("disable")}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Disable
                      </button>
                    )}

                    {form.status !== "archived" && (
                      <button
                        type="button"
                        disabled={transitioning}
                        onClick={() => runLifecycleAction("archive")}
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                      >
                        Archive
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setEmailModalOpen(true)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Configure Email
                    </button>
                  </div>
                </div>

                {emailModalOpen && (
                  <RequestFormEmailConfigModal
                    initial={{
                      senderName: form.emailConfig?.senderName || "",
                      greeting: form.emailConfig?.greeting || "Hello,",
                      message:
                        form.emailConfig?.message ||
                        "We received your request and it is currently being processed.",
                      closing: form.emailConfig?.closing || "Thank you,",
                    }}
                    saving={savingEmailConfig}
                    onClose={() => setEmailModalOpen(false)}
                    onSave={saveEmailConfig}
                  />
                )}

                <RequestFormBuilder
                  initialName={form.name}
                  initialDescription={form.description || ""}
                  initialStatus={form.status === "published" ? "published" : "draft"}
                  initialQuestions={form.questions || []}
                  initialPages={form.pages || []}
                  initialApprovalRequired={form.approvalRequired ?? true}
                  initialSaveToProjectId={form.saveTo?.project || null}
                  initialAssignToMode={form.assignTo?.mode || "me"}
                  initialAssignToUserIds={form.assignTo?.users || []}
                  initialDesign={form.design}
                  projects={projects}
                  members={members}
                  saving={saving}
                  saveLabel="Save Changes"
                  onSave={save}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
