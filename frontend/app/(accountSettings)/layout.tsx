"use client";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const SETTINGS_NAV = [
  { href: "/settings/account", label: "Account info" },
  { href: "/settings/create-organization", label: "Create organization" },
  { href: "/profile/edit", label: "Edit profile" },
  { href: "/change-password", label: "Change password" },
  { href: "/settings/leave", label: "Apply Leave" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeItem = SETTINGS_NAV.find((item) => item.href === pathname);

  // Collapse the mobile menu whenever the settings sub-page changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] bg-[#F6F9FC] text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="flex flex-col lg:flex-row h-full min-h-0 min-w-0">
            <aside className="w-full lg:w-64 min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-4 sm:p-6 shrink-0 overflow-x-auto lg:overflow-y-auto dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2 lg:block">
                <div>
                  <h2 className="text-lg font-bold mb-1">Personal settings</h2>
                  <p className="text-slate-500 text-sm lg:mb-6 dark:text-slate-400">
                    {activeItem ? activeItem.label : "Manage your account"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((open) => !open)}
                  aria-label={mobileNavOpen ? "Close settings menu" : "Open settings menu"}
                  aria-expanded={mobileNavOpen}
                  className="lg:hidden shrink-0 h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
              <nav
                className={`${
                  mobileNavOpen ? "flex" : "hidden"
                } flex-col gap-1 mt-3 lg:mt-0 lg:flex lg:space-y-1`}
              >
                {SETTINGS_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 block px-4 py-3 rounded-xl text-sm transition ${
                      pathname === item.href
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>
            <div className="flex-1 min-w-0 min-h-0 p-4 sm:p-6 lg:p-10 overflow-y-auto overflow-x-hidden">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
