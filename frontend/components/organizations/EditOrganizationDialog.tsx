"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import FormLabel from "@/components/ui/FormLabel";
import Logo from "@/components/ui/Logo";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import { useOrgLogoSrc, clearOrgLogoCache } from "@/hooks/useOrgLogo";

const ALLOWED_LOGO_EXT = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];

function isAllowedLogoFile(file: File) {
  const name = file.name.toLowerCase();
  if (ALLOWED_LOGO_EXT.some((ext) => name.endsWith(ext))) return true;
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    type === "image/svg+xml" ||
    type === "image/svg"
  );
}

type Props = {
  orgId: string;
  name: string;
  description?: string;
  hasLogo?: boolean;
  logoUpdatedAt?: string | null;
  onClose: () => void;
  onSaved: (next: {
    name: string;
    description: string;
    hasLogo: boolean;
    logoUpdatedAt: string | null;
  }) => void;
};

export default function EditOrganizationDialog({
  orgId,
  name,
  description = "",
  hasLogo = false,
  logoUpdatedAt = null,
  onClose,
  onSaved,
}: Props) {
  const [orgName, setOrgName] = useState(name);
  const [orgDescription, setOrgDescription] = useState(description);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const existingLogoSrc = useOrgLogoSrc(orgId, hasLogo && !removeLogo && !file, logoUpdatedAt);

  useEffect(() => {
    let cancelled = false;
    void authFetch(`/organizations/${orgId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setOrgName(data.name || name);
        setOrgDescription(data.description || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId, name]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displaySrc = previewUrl || (!removeLogo ? existingLogoSrc : null);

  const pickFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    if (!isAllowedLogoFile(next)) {
      setError("Please choose a PNG, JPG, JPEG, or SVG image.");
      return;
    }
    if (next.size > 2 * 1024 * 1024) {
      setError("Logo must be 2 MB or smaller.");
      return;
    }
    setError("");
    setRemoveLogo(false);
    setFile(next);
  };

  const save = async () => {
    const trimmed = orgName.trim();
    if (!trimmed) {
      setError("Organization name is required.");
      return;
    }

    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.append("name", trimmed);
    formData.append("description", orgDescription.trim());
    if (file) formData.append("logo", file);
    if (removeLogo && !file) formData.append("removeLogo", "true");

    try {
      const res = await authFetch(`/organizations/${orgId}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Could not update organization");
      }
      toast.success("Organization updated");
      clearOrgLogoCache(orgId);
      onSaved({
        name: data.name || trimmed,
        description: data.description ?? orgDescription.trim(),
        hasLogo: Boolean(data.hasLogo),
        logoUpdatedAt: data.logoUpdatedAt || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth="lg" className="overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <ModalHeader
          title="Edit organization"
          subtitle="Update the workspace name, description, and logo."
          onClose={onClose}
          className="mb-0"
        />
      </div>

      <div className="px-6 py-5 space-y-4">
        <div>
          <FormLabel>Organization logo</FormLabel>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center dark:border-slate-700 dark:bg-slate-800">
              {displaySrc ? (
                <img src={displaySrc} alt="" className="w-full h-full object-contain" />
              ) : (
                <Logo className="w-12 h-12" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <ImagePlus size={14} />
                {displaySrc ? "Change logo" : "Upload logo"}
              </button>
              {displaySrc && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setRemoveLogo(true);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Trash2 size={14} />
                  Use default
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 dark:text-slate-500">
            PNG, JPG, JPEG, or SVG. Max 2 MB. If no logo is set, the WriTask mark is used.
          </p>
        </div>

        <div>
          <FormLabel>Organization name</FormLabel>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <FormLabel>Description</FormLabel>
          <textarea
            value={orgDescription}
            onChange={(e) => setOrgDescription(e.target.value)}
            rows={4}
            placeholder="What this workspace is for"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none resize-y min-h-24 focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </ModalShell>
  );
}
