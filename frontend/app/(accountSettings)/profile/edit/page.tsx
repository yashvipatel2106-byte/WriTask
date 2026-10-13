"use client";

import { useAuth } from "@/hooks/useAuth";
import { useLogout } from "@/hooks/useLogout";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { COUNTRY_OPTIONS } from "@/lib/constants/countries";
import {
  COUNTRY_DIAL_CODES,
  DIAL_CODE_OPTIONS,
  DIAL_CODE_TO_COUNTRY,
} from "@/lib/constants/countryDialCodes";
import { DEPARTMENT_OPTIONS } from "@/lib/constants/departments";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import { Pencil, Check } from "lucide-react";

const GRADIENT_PRESETS = [
  "linear-gradient(to right, #06b6d4, #9333ea)",
  "linear-gradient(to right, #3b82f6, #4f46e5)",
  "linear-gradient(to right, #10b981, #14b8a6)",
  "linear-gradient(to right, #f59e0b, #f97316)",
  "linear-gradient(to right, #f43f5e, #ec4899)",
  "linear-gradient(to right, #8b5cf6, #d946ef)",
  "linear-gradient(to right, #0ea5e9, #2563eb)",
  "linear-gradient(to right, #22c55e, #16a34a)",
  "linear-gradient(to right, #ef4444, #f97316)",
  "linear-gradient(to right, #ec4899, #f43f5e)",
  "linear-gradient(to right, #6366f1, #a855f7)",
  "linear-gradient(to right, #14b8a6, #06b6d4)",
  "linear-gradient(to right, #d946ef, #ec4899)",
  "linear-gradient(to right, #84cc16, #22c55e)",
  "linear-gradient(to right, #f97316, #ef4444)",
  "linear-gradient(to right, #64748b, #334155)",
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
];

const SOLID_PRESETS = [
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#64748b",
  "#6b7280",
  "#78716c",
];

const inputClass =
  "w-full mt-2 bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 outline-none transition-all focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 focus:bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20 dark:focus:bg-slate-800";
const readOnlyClass =
  "w-full mt-2 bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500";
const labelClass = "text-sm font-medium text-slate-600 dark:text-slate-300";

type ProfileForm = {
  username: string;
  email: string;
  phone: string;
  countryCode: string;
  designation: string;
  department: string;
  location: string;
  bio: string;
  avatarColor?: string;
  designationLocked?: boolean;
  departmentLocked?: boolean;
  isOrgOwner?: boolean;
};

function normalizePhoneInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** Splits a stored phone value like "+911234567898" back into its dial code and 10-digit number. */
function parsePhone(raw: string): { countryCode: string; phone: string } {
  const match = raw.match(/^(\+\d{1,4})(\d{10})$/);
  if (match) return { countryCode: match[1], phone: match[2] };
  return { countryCode: "", phone: normalizePhoneInput(raw) };
}

export default function EditProfilePage() {
  const router = useRouter();
  const logout = useLogout();
  const { user, loading, profileReady, saveProfile } = useAuth();
  const [form, setForm] = useState<ProfileForm>({
    username: "",
    email: "",
    phone: "",
    countryCode: "",
    designation: "",
    department: "",
    location: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!user || !profileReady) return;

    const { countryCode, phone } = parsePhone(user.phone || "");
    const location = user.location || "";

    setForm({
      username: user.username || "",
      email: user.email || "",
      phone,
      countryCode:
        countryCode || COUNTRY_DIAL_CODES[location as keyof typeof COUNTRY_DIAL_CODES] || "",
      designation: user.profileMeta?.isOrgOwner
        ? "admin"
        : user.designation || "",
      department: user.department || "",
      location,
      bio: user.bio || "",
      avatarColor: user.avatarColor || "",
      designationLocked: user.profileMeta?.designationLocked,
      departmentLocked: user.profileMeta?.departmentLocked,
      isOrgOwner: user.profileMeta?.isOrgOwner,
    });
  }, [user, profileReady]);

  useEffect(() => {
    if (!showColorPicker) return;
    const onClick = (e: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showColorPicker]);

  const handlePhoneChange = (value: string) => {
    const digits = normalizePhoneInput(value);
    setForm((prev) => ({ ...prev, phone: digits }));
    if (digits.length > 0 && digits.length !== 10) {
      setPhoneError("Phone must be exactly 10 digits");
    } else {
      setPhoneError("");
    }
  };

  // Selecting a country also fills in its dial code, without clobbering a
  // country code the user already picked by hand for a different country.
  const handleCountryChange = (country: string) => {
    const dialCode = COUNTRY_DIAL_CODES[country as keyof typeof COUNTRY_DIAL_CODES] || "";
    setForm((prev) => ({
      ...prev,
      location: country,
      countryCode: dialCode || prev.countryCode,
    }));
  };

  // Selecting a dial code also fills in its country, unless the currently
  // selected country already uses that same dial code (e.g. +1 covers both
  // Canada and the United States — don't jump away from the one picked by hand).
  const handleCountryCodeChange = (dialCode: string) => {
    setForm((prev) => {
      const currentDialCode =
        COUNTRY_DIAL_CODES[prev.location as keyof typeof COUNTRY_DIAL_CODES];
      const location =
        currentDialCode === dialCode
          ? prev.location
          : DIAL_CODE_TO_COUNTRY[dialCode] || prev.location;
      return { ...prev, countryCode: dialCode, location };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.phone && form.phone.length !== 10) {
      setPhoneError("Phone must be exactly 10 digits");
      return;
    }

    setSaving(true);

    const payload: Record<string, string> = {
      username: form.username.trim(),
      phone: form.phone ? `${form.countryCode}${form.phone}` : "",
      location: form.location,
      bio: form.bio,
      avatarColor: form.avatarColor || "",
    };

    if (!form.designationLocked) {
      payload.designation = form.designation;
    }

    if (!form.departmentLocked) {
      payload.department = form.department;
    }

    const result = await saveProfile(payload);
    setSaving(false);

    if (result.ok) {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.avatarColor = form.avatarColor || "";
          localStorage.setItem("user", JSON.stringify(parsed));
          window.dispatchEvent(new Event("user-updated"));
        }
      } catch {}
      router.push("/settings/account");
      return;
    }

    setError(result.error || "Failed to update profile");
  };

  const handleDeleteAccount = async () => {
    const ok = await confirmDialog({
      title: "Delete account permanently?",
      description: "This cannot be undone. Your account and data will be removed.",
      confirmLabel: "Delete account",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    const res = await authFetch("/profile", { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      logout();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.message || "Failed to delete account");
    }
  };

  const initial = form.username.charAt(0).toUpperCase() || "U";

  const renderSwatch = (preset: string) => {
    const active = form.avatarColor === preset;
    return (
      <button
        key={preset}
        type="button"
        onClick={() => setForm({ ...form, avatarColor: preset })}
        aria-label="Avatar color option"
        className={`relative h-9 w-full rounded-lg shadow-sm transition hover:scale-105 ${
          active ? "ring-2 ring-slate-900 ring-offset-2" : ""
        }`}
        style={{ background: preset }}
      >
        {active && (
          <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
      </button>
    );
  };

  if (loading && !profileReady) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        Loading profile...
      </div>
    );
  }

  return (
    <>
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Edit Profile</h1>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                Update your personal information and how others see you.
              </p>
            </div>

            {error && (
              <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Avatar header band */}
              <div className="flex flex-col items-center border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-8 pt-10 pb-8 dark:border-slate-800 dark:from-slate-800 dark:to-slate-900">
                <div className="relative" ref={colorPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker((v) => !v)}
                    aria-label="Change avatar color"
                    className="h-28 w-28 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-lg ring-4 ring-white transition-transform hover:scale-105 focus:outline-none focus:ring-cyan-100 dark:ring-slate-900 dark:focus:ring-cyan-500/20"
                    style={{
                      background:
                        form.avatarColor ||
                        "linear-gradient(to right, #06b6d4, #9333ea)",
                    }}
                  >
                    {initial}
                  </button>

                  {/* Edit badge */}
                  <span className="pointer-events-none absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-cyan-600 text-white shadow-md dark:border-slate-900">
                    <Pencil size={14} />
                  </span>

                  {showColorPicker && (
                    <div className="absolute left-1/2 top-full z-20 mt-3 max-h-[380px] w-72 -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Gradients
                      </p>
                      <div className="mb-4 grid grid-cols-5 gap-2">
                        {GRADIENT_PRESETS.map(renderSwatch)}
                      </div>

                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Solid colors
                      </p>
                      <div className="mb-4 grid grid-cols-5 gap-2">
                        {SOLID_PRESETS.map(renderSwatch)}
                      </div>

                      <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <label className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
                          Custom color
                          <input
                            type="color"
                            value={
                              form.avatarColor?.startsWith("#")
                                ? form.avatarColor
                                : "#06b6d4"
                            }
                            onChange={(e) =>
                              setForm({ ...form, avatarColor: e.target.value })
                            }
                            className="h-8 w-12 cursor-pointer rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowColorPicker(false)}
                        className="mt-4 w-full rounded-xl bg-slate-100 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>

                <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
                  {form.username || "Your name"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{form.email}</p>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Click your avatar to change its color
                </p>
              </div>

              {/* Form body */}
              <div className="px-8 py-8">
                <form
                  onSubmit={handleSubmit}
                  className="grid gap-6 md:grid-cols-2"
                >
                  <div>
                    <label className={labelClass}>Full Name</label>
                    <input
                      value={form.username}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Email</label>
                    <input value={form.email} readOnly className={readOnlyClass} />
                  </div>

                  <div>
                    <label className={labelClass}>Phone Number</label>
                    <div className="mt-2 flex">
                      <Select
                        value={form.countryCode}
                        onChange={handleCountryCodeChange}
                        options={[
                          { value: "", label: "Code" },
                          ...DIAL_CODE_OPTIONS.map((code) => ({ value: code, label: code })),
                        ]}
                        className="shrink-0"
                        triggerClassName={(open) =>
                          `flex items-center justify-between gap-1 w-24 bg-slate-50 border p-4 rounded-l-xl rounded-r-none border-r-0 text-slate-900 outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                            open
                              ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-700"
                          }`
                        }
                        menuClassName="min-w-[140px] max-h-72 overflow-y-auto"
                      />
                      <input
                        value={form.phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10-digit number"
                        className={inputClass.replace("mt-2 ", "") + " rounded-l-none flex-1"}
                      />
                    </div>
                    {phoneError && (
                      <p className="mt-1 text-sm text-red-500 dark:text-red-400">{phoneError}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Designation</label>
                    {form.designationLocked ? (
                      <input
                        value="admin"
                        readOnly
                        className={`${readOnlyClass} capitalize`}
                      />
                    ) : (
                      <input
                        value={form.designation}
                        onChange={(e) =>
                          setForm({ ...form, designation: e.target.value })
                        }
                        className={inputClass}
                      />
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Department</label>
                    {form.departmentLocked ? (
                      <input
                        value={form.department}
                        readOnly
                        className={readOnlyClass}
                      />
                    ) : (
                      <Select
                        value={form.department}
                        onChange={(v) => setForm({ ...form, department: v })}
                        options={[
                          { value: "", label: "Select department" },
                          ...DEPARTMENT_OPTIONS.map((dept) => ({
                            value: dept,
                            label: dept,
                          })),
                        ]}
                        className="w-full mt-2"
                        triggerClassName={(open) =>
                          `flex items-center justify-between gap-2 w-full bg-slate-50 border p-4 rounded-xl text-slate-900 outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                            open
                              ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-700"
                          }`
                        }
                        menuClassName="min-w-[220px]"
                      />
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Country</label>
                    <Select
                      value={form.location}
                      onChange={handleCountryChange}
                      options={[
                        { value: "", label: "Select country" },
                        ...COUNTRY_OPTIONS.map((country) => ({
                          value: country,
                          label: country,
                        })),
                      ]}
                      className="w-full mt-2"
                      triggerClassName={(open) =>
                        `flex items-center justify-between gap-2 w-full bg-slate-50 border p-4 rounded-xl text-slate-900 outline-none transition-all cursor-pointer dark:bg-slate-800 dark:text-slate-100 ${
                          open
                            ? "border-cyan-400 ring-4 ring-cyan-100 bg-white dark:border-cyan-500 dark:ring-cyan-500/20 dark:bg-slate-800"
                            : "border-slate-200 dark:border-slate-700"
                        }`
                      }
                      menuClassName="min-w-[220px] max-h-72 overflow-y-auto"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>Bio</label>
                    <textarea
                      rows={4}
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <div className="md:col-span-2 mt-2 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6 dark:border-slate-800">
                    <Link
                      href="/settings/account"
                      className="rounded-xl border border-slate-200 px-8 py-3 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={saving || !!phoneError}
                      className="rounded-xl bg-cyan-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-cyan-700 hover:shadow-md disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
    </>
  );
}