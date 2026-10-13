"use client";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

type NavItem = {
  href: string;
  label: string;
};

type SettingsSection = "account" | "organization";

const ACCOUNT_NAV: NavItem[] = [
  { href: "/settings/account", label: "Account info" },
  { href: "/profile/edit", label: "Edit profile" },
  { href: "/change-password", label: "Change password" },
  { href: "/settings/leave", label: "Apply Leave" },
];

/**
 * Organization settings navigation.
 *
 * Everyone in an organization can:
 * - View Overview
 * - View Appearance
 * - View Working Calendar
 *
 * Only the organization Owner can access:
 * - Create organization
 * - Edit organization
 * - Organization members
 * - Organization administration
 */
function orgNavItems(
  orgId: string | null,
  isOwner: boolean,
  canManageRequestForms: boolean,
  canAccessRequestForms: boolean
): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/settings/organization",
      label: "Overview",
    },
    {
      href: "/settings/appearance",
      label: "Appearance",
    },


    

  ];

  /**
   * Working Calendar is viewable by all organization roles.
   *
   * The Working Calendar page itself is responsible for
   * restricting holiday modifications to the Owner.
   */
  if (orgId) {
    items.push({
      href: "/settings/organization/working-calendar",
      label: "Working Calendar",
    });
  }

  /**
   * Organization management options are Owner-only.
   *
   * Do not use org:update here because other roles may have
   * organization permissions for other functionality.
   */
  if (isOwner) {
    items.push(
      {
        href: "/settings/create-organization",
        label: "Create organization",
      },
      {
        href: "/settings/organization/edit",
        label: "Edit organization",
      }
    );

    if (orgId) {
      items.push({
        href: `/organizations/${orgId}/members`,
        label: "Organization members",
      });
    }

    items.push({
      href: "/admin",
      label: "Organization administration",
    });
  }

  /*
   * Request Form management is Owner/Admin, not Owner-only —
   * canManageRequestForms already checks for either role.
   */
  if (orgId && canManageRequestForms) {
    items.push({
      label: "Request Form",
      href: "/settings/organization/request-form",
    });
  } else if (orgId && canAccessRequestForms) {
    /*
     * Other roles (e.g. Developer) can't create/manage forms, but
     * still need a way to find Request Forms from Settings — link
     * straight to the browse/submit list instead of the
     * create/manage hub.
     */
    items.push({
      label: "Request Forms",
      href: "/request-forms",
    });
  }

  return items;
}

function sectionFromPath(
  pathname: string
): SettingsSection {
  if (
    pathname.startsWith("/settings/organization") ||
    pathname.startsWith("/settings/create-organization") ||
    pathname.startsWith("/settings/appearance") ||
    pathname === "/admin" ||
    (pathname.includes("/organizations/") &&
      pathname.endsWith("/members"))
  ) {
    return "organization";
  }

  return "account";
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const { currentOrg } =
    useOrganization();

  const {
  role,
  inOrgContext,
  can,
  canManageRequestForms,
} = useOrgPermission();

  const canAccessRequestForms =
    can("requestForm:submit") || can("requestForm:review");

  /**
   * Organization owner check.
   *
   * This is intentionally separate from permission checks.
   * The requirement is that organization-management settings
   * are available only to the actual organization Owner.
   */
  const isOrgOwner =
    role === "owner";

  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(false);

  const section = useMemo(
    () => sectionFromPath(pathname),
    [pathname]
  );

  const orgId =
    currentOrg?.organizationId || null;

  /**
   * Build organization settings navigation.
   *
   * We no longer use:
   * - canCreateOrganization
   * - canUpdateOrg
   * - canViewMembers
   * - canViewAdmin
   *
   * because those permissions were causing management
   * links to appear depending on individual permissions.
   *
   * Owner gets the complete organization settings menu.
   * All other roles get only:
   * - Overview
   * - Appearance
   * - Working Calendar
   */
  const orgItems = useMemo(
    () => {
      return orgNavItems(
  orgId,
  isOrgOwner,
  canManageRequestForms,
  canAccessRequestForms
);
    },
    [
      orgId,
      isOrgOwner,
      canManageRequestForms,
      canAccessRequestForms,
    ]
  );

  const navItems =
    section === "account"
      ? ACCOUNT_NAV
      : orgItems;

  const activeItem =
    navItems.find(
      (item) =>
        item.href === pathname
    );

  const title =
    section === "account"
      ? "Account Settings"
      : "Organization Settings";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const linkClass = (
    href: string
  ) =>
    `shrink-0 block px-4 py-2.5 rounded-xl text-sm transition ${
      pathname === href
        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-[#0B1120]">
      <Navbar />

      <div className="flex h-full">
        <Sidebar />

        <main className="flex-1 min-w-0 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] bg-[#F6F9FC] text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
          <div className="flex flex-col lg:flex-row h-full min-h-0 min-w-0">

            {/* Settings sidebar */}
            <aside className="settings-subnav w-full lg:w-64 min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-4 sm:p-6 shrink-0 overflow-x-auto lg:overflow-y-auto dark:border-slate-800 dark:bg-slate-900">

              <div className="flex items-center justify-between gap-2 lg:block">
                <div>
                  <h2 className="text-lg font-bold mb-1">
                    {title}
                  </h2>

                  <p className="text-slate-500 text-sm lg:mb-6 dark:text-slate-400">
                    {activeItem
                      ? activeItem.label
                      : "Manage your settings"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setMobileNavOpen(
                      (open) => !open
                    )
                  }
                  aria-label={
                    mobileNavOpen
                      ? "Close settings menu"
                      : "Open settings menu"
                  }
                  aria-expanded={
                    mobileNavOpen
                  }
                  className="lg:hidden shrink-0 h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {mobileNavOpen ? (
                    <X size={18} />
                  ) : (
                    <Menu size={18} />
                  )}
                </button>
              </div>

              <nav
                className={`${
                  mobileNavOpen
                    ? "flex"
                    : "hidden"
                } flex-col gap-1 mt-3 lg:mt-0 lg:flex`}
              >
                {navItems.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={
                        pathname ===
                        item.href
                          ? "page"
                          : undefined
                      }
                      className={linkClass(
                        item.href
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </nav>
            </aside>

            {/* Settings content */}
            <div className="flex-1 min-w-0 min-h-0 p-4 sm:p-6 lg:p-10 overflow-y-auto overflow-x-hidden">
              {children}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}