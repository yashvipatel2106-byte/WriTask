"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

import RequestFormBuilder from "@/components/requestForms/RequestFormBuilder";

import {
  createRequestForm,
  fetchOrganizationMembers,
  fetchRequestProjects,
  type RequestFormSavePayload,
  type RequestProject,
  type RequestProjectMember,
} from "@/lib/requestForms";

import { toast } from "@/components/ui/toast";

export default function CreateRequestFormPage() {
  const router = useRouter();

  const { currentOrg, orgReady } = useOrganization();
  const { canManageRequestForms } = useOrgPermission();

  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<RequestProject[]>([]);
  const [members, setMembers] = useState<RequestProjectMember[]>([]);

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

  if (!orgReady) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />

        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">
            Loading request form builder...
          </div>
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
          <div className="dashboard-widget">
            Request Forms are available inside an organization workspace.
          </div>
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

  const save = async (payload: RequestFormSavePayload) => {
    if (!currentOrg.organizationId) return;

    setSaving(true);

    try {
      const response = await createRequestForm(
        currentOrg.organizationId,
        payload
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(
          data.message || "Failed to create request form."
        );
        return;
      }

      toast.success(
        payload.status === "published"
          ? "Request form published."
          : "Request form saved as draft."
      );

      if (data?._id && canManageRequestForms) {
        router.push(`/request-forms/${data._id}/edit`);
      } else {
        router.push("/request-forms");
      }
    } catch (error) {
      console.error("Create request form error:", error);

      toast.error(
        "Something went wrong while creating the form."
      );
    } finally {
      setSaving(false);
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
                  onClick={() =>
                    router.push("/settings/organization/request-form")
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Form
                </button>

                <div className="mb-7">
                  <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                    Create Request Form
                  </h1>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Build a form that members can submit for work in their projects.
                  </p>
                </div>

                <RequestFormBuilder
                  saving={saving}
                  saveLabel="Create Form"
                  projects={projects}
                  members={members}
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
