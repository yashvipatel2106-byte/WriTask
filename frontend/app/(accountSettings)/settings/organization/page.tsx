"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Palette,
  Pencil,
  Plus,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

export default function OrganizationSettingsPage() {
  const { currentOrg } = useOrganization();

  const {
    role,
    inOrgContext,
    can,
  } = useOrgPermission();

  const isOrgOwner = role === "owner";

  const orgId =
    currentOrg?.organizationId || null;

  const commonLink = (
    href: string,
    label: string,
    description: string,
    Icon: LucideIcon
  ) => (
    <Link
      key={href}
      href={href}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon size={17} />
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </span>

        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
    </Link>
  );

  return (
    <div className="max-w-2xl">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Organization Settings
        </h1>

        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {currentOrg
            ? `Manage ${currentOrg.name} and organization-wide options.`
            : "Create an organization or switch into one from the top navigation to manage it."}
        </p>
      </div>

      {/* =====================================================
          SETTINGS LINKS
          ===================================================== */}

      <div className="space-y-2">
        {/* Appearance */}

        {commonLink(
          "/settings/appearance",
          "Appearance",
          "Theme and display preferences.",
          Palette
        )}

        {/* Working Calendar */}

        {inOrgContext &&
          orgId &&
          commonLink(
            "/settings/organization/working-calendar",
            "Working Calendar",
            "India / Gujarat holidays used for resource capacity.",
            CalendarDays
          )}

        {/* ===================================================
            REQUEST FORM
            =================================================== */}

        {inOrgContext &&
          orgId &&
          can("requestForm:manage") &&
          commonLink(
            "/settings/organization/request-form",
            "Request Form",
            "Create and manage organization request forms.",
            ClipboardList
          )}

        {/* ===================================================
            OWNER SETTINGS
            =================================================== */}

        {isOrgOwner && (
          <>
            {commonLink(
              "/settings/create-organization",
              "Create organization",
              "Start a new organization workspace.",
              Plus
            )}

            {inOrgContext &&
              orgId &&
              commonLink(
                "/settings/organization/edit",
                "Edit organization",
                "Update name, logo, and daily work hours.",
                Pencil
              )}

            {inOrgContext &&
              orgId &&
              commonLink(
                `/organizations/${orgId}/members`,
                "Organization members",
                "Invite and manage people in this organization.",
                Users
              )}

            {inOrgContext &&
              orgId &&
              commonLink(
                "/admin",
                "Organization administration",
                "Roles, permissions, and admin tools.",
                ShieldCheck
              )}
          </>
        )}

        {/* ===================================================
            NO ORGANIZATION
            =================================================== */}

        {!currentOrg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <Building2 size={16} />

            Switch to an organization to view organization settings.
          </div>
        )}
      </div>
    </div>
  );
}