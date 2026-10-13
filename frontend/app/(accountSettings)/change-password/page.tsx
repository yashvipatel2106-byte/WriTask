"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { authFetch } from "@/lib/validation/authFetch";

export default function ChangePasswordPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.currentPassword || !form.newPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("/change-password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || "Failed to update password");
        return;
      }

       toast.success("Password updated successfully");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg">

        {/* Header */}

        <div className="text-center mb-8">

          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-r bg-cyan-600 flex items-center justify-center mx-auto mb-4 text-2xl sm:text-3xl shrink-0">
            🔒
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
            Change Password
          </h1>

          <p className="text-slate-500 mt-2 dark:text-slate-400">
            Keep your account secure by updating your password regularly.
          </p>

        </div>

        {/* Card */}

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm dark:bg-slate-900 dark:border-slate-800">

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >

            {/* Current Password */}

            <div>

              <label className="block text-slate-600 mb-2 dark:text-slate-300">
                Current Password
              </label>

              <input
                type="password"
                placeholder="Enter current password"
                value={form.currentPassword}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currentPassword: e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-cyan-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500"
              />

            </div>

            {/* New Password */}

            <div>

              <label className="block text-slate-600 mb-2 dark:text-slate-300">
                New Password
              </label>

              <input
                type="password"
                placeholder="Enter new password"
                value={form.newPassword}
                onChange={(e) =>
                  setForm({
                    ...form,
                    newPassword: e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-cyan-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500"
              />

            </div>

            {/* Confirm Password */}

            <div>

              <label className="block text-slate-600 mb-2 dark:text-slate-300">
                Confirm Password
              </label>

              <input
                type="password"
                placeholder="Confirm new password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({
                    ...form,
                    confirmPassword: e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-cyan-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500"
              />

            </div>

            {/* Password Rules */}

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">

              <h3 className="text-slate-900 font-semibold mb-2 dark:text-slate-100">
                Password Requirements
              </h3>

              <ul className="text-sm text-slate-500 space-y-1 dark:text-slate-400">
                <li>• Minimum 8 characters</li>
               <li>• One uppercase letter</li>
               <li>• One lowercase letter</li>
               <li>• One number</li>
               <li>• One special character</li>
              </ul>

            </div>

            {/* Buttons */}

            <div className="flex flex-wrap justify-end gap-3 pt-2">

              <button
                type="button"
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-gradient-to-r bg-cyan-600 hover:bg-cyan-700 text-white font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>

            </div>

          </form>

        </div>

    </div>
  );
}