"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import OrgSwitchPasswordDialog from "@/components/organizations/OrgSwitchPasswordDialog";

function OrgSwitchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Building / organization */}
      <path
        d="M4.5 20.5V6.75A1.75 1.75 0 0 1 6.25 5h7.5A1.75 1.75 0 0 1 15.5 6.75V20.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 10.5h3.25A1.25 1.25 0 0 1 20 11.75V20.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 20.5h17"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      {/* Windows */}
      <path
        d="M8 8.5h.01M11.5 8.5h.01M8 11.75h.01M11.5 11.75h.01M8 15h.01M11.5 15h.01"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Entrance */}
      <path
        d="M9.25 20.5v-3.25c0-.69.56-1.25 1.25-1.25h.5c.69 0 1.25.56 1.25 1.25V20.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Icon-only organization switcher placed beside the brand.
 * Preserves password-gated org switch. No Organization Settings link here.
 */
export default function OrgSwitcher() {
  const {
    access,
    currentOrg,
    loading,
    orgReady,
    setCurrentOrgId,
  } = useOrganization();
  const { canCreateOrganization } = useOrgPermission();

  const [open, setOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{
    organizationId: string;
    name: string;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const orgs = access?.organizations || [];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const requestOrgSwitch = (organizationId: string, name: string) => {
    if (organizationId === currentOrg?.organizationId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setPendingSwitch({ organizationId, name });
  };

  if (loading || !orgReady) {
    return <div className="skeleton h-10 w-10 rounded-full" aria-hidden />;
  }

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Switch organization"
          aria-haspopup="listbox"
          aria-expanded={open}
          title={currentOrg?.name || "Switch organization"}
          className="relative h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <OrgSwitchIcon className="h-[18px] w-[18px]" />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 dark:border-slate-700 dark:bg-slate-900"
          >
            {orgs.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                No organizations yet.
              </p>
            ) : null}

            {orgs.map((org) => {
              const active = org.organizationId === currentOrg?.organizationId;
              return (
                <button
                  key={org.organizationId}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() =>
                    requestOrgSwitch(org.organizationId, org.name)
                  }
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="flex-1 truncate text-slate-800 dark:text-slate-100">
                    {org.name}
                  </span>
                  {active ? (
                    <Check
                      size={15}
                      className="text-cyan-600 dark:text-cyan-400"
                    />
                  ) : null}
                </button>
              );
            })}

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            {canCreateOrganization ? (
              <Link
                href="/settings/create-organization"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-400/10"
              >
                <Plus size={15} />
                Add Organization
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {pendingSwitch && (
        <OrgSwitchPasswordDialog
          organizationId={pendingSwitch.organizationId}
          organizationName={pendingSwitch.name}
          onClose={() => setPendingSwitch(null)}
          onSwitched={(orgId) => {
            setCurrentOrgId(orgId);
          }}
        />
      )}
    </>
  );
}
