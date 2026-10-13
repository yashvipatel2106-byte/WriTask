"use client";

import Link from "next/link";
import { useLogout } from "@/hooks/useLogout";

interface Props {
  open: boolean;
}

export default function ProfileDropdown({ open }: Props) {
  const logout = useLogout();

  if (!open) return null;

  return (
    <div className="absolute right-0 mt-3 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl z-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800">
        <Link
          href="/settings/account"
          className="flex items-center gap-3 w-full px-5 py-3 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-400"
        >
          Account info
        </Link>

        <Link
          href="/profile/edit"
          className="flex items-center gap-3 w-full px-5 py-3 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-400"
        >
          Edit profile
        </Link>

        <Link
          href="/change-password"
          className="flex items-center gap-3 w-full px-5 py-3 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-400"
        >
          Change password
        </Link>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={logout}
          className="w-full text-left px-7 py-5 text-red-500 hover:bg-red-50 hover:text-red-600 transition dark:hover:bg-red-500/10"
        >
          Logout
        </button>
      </div>
    </div>
  );
}