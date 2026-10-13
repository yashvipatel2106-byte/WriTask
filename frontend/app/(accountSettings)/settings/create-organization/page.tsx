"use client";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { authFetch } from "@/lib/validation/authFetch";
import { clearStoredProjectId } from "@/lib/orgStorage";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CreateOrganizationSettingsPage() {
  const router = useRouter();
  const { refreshAccess, setCurrentOrgId } = useOrganization();
  const { canCreateOrganization, orgReady } = useOrgPermission();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!orgReady) return;
    if (!canCreateOrganization) router.replace("/settings/organization");
  }, [orgReady, canCreateOrganization, router]);

  if (orgReady && !canCreateOrganization) {
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const res = await authFetch("/organizations", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), description }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      clearStoredProjectId();
      await refreshAccess();
      setCurrentOrgId(data._id);
      router.push("/dashboard");
    } else {
      toast.error(data.message || "Failed to create organization");
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">Create organization</h1>
      <p className="text-slate-500 mb-8 dark:text-slate-400">
        Set up a new workspace for your team. You will be the owner and can
        invite members by email.
      </p>

      <form
        onSubmit={submit}
        className="bg-white border border-slate-200 shadow-sm p-4 sm:p-8 rounded-2xl dark:bg-slate-900 dark:border-slate-800"
      >
        <label className="text-slate-500 text-sm dark:text-slate-400">Organization name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Corp"
          className="w-full p-4 rounded-xl bg-slate-50 text-slate-900 mt-2 mb-4 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:placeholder:text-slate-500"
          required
        />
        <label className="text-slate-500 text-sm dark:text-slate-400">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does your team work on?"
          rows={4}
          className="w-full p-4 rounded-xl bg-slate-50 text-slate-900 mt-2 mb-6 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto bg-gradient-to-r bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-xl disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create organization"}
        </button>
      </form>
    </div>
  );
}
