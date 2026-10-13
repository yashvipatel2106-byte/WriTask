"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLogout } from "@/hooks/useLogout";
import SearchResultsList from "@/components/search/SearchResultsList";
import { useSearchQuery } from "@/lib/useSearchQuery";
import { Bell, Search, Menu } from "lucide-react";
import { useSidebar } from "@/components/context/sidebarContext";
import { avatarColor } from "@/lib/avatarColor";
import { useOrganization } from "@/components/context/organizationContext";
import {
  actorName,
  fetchNotificationSummary,
  fetchNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_TYPE_LABELS,
  type NotificationItem,
  type NotificationType,
  typeBadgeClass,
} from "@/lib/notifications";
import UserAvatar from "@/components/ui/UserAvatar";
import Logo from "@/components/ui/Logo";
import OrgSwitcher from "@/components/navbar/OrgSwitcher";
import StatusMenu from "@/components/navbar/StatusMenu";
import { useOrgLogoSrc } from "@/hooks/useOrgLogo";

export interface User {
  id: string;
  username: string;
  email: string;
  systemRole: string;
  avatarColor?: string;
}

export default function Navbar() {
  const { currentOrg, currentOrgId, loading: orgLoading, orgReady } =
    useOrganization();
  const orgLogoSrc = useOrgLogoSrc(
    currentOrg?.organizationId,
    currentOrg?.hasLogo,
    currentOrg?.logoUpdatedAt
  );
  const { toggle: toggleSidebar } = useSidebar();
  const [search, setSearch] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const logout = useLogout();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [userHydrated, setUserHydrated] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const searchScope = currentOrgId
    ? { organizationId: currentOrgId }
    : { personal: true };

  const { results, isReady } = useSearchQuery(search, 5, 120, searchScope);
  const [user, setUser] = useState<User | null>(null);

useEffect(() => {
    const readUser = () => {
      const storedUser = localStorage.getItem("user");
      if (storedUser) setUser(JSON.parse(storedUser));
      else setUser(null);
      setUserHydrated(true);
    };
    readUser();
    window.addEventListener("user-updated", readUser);
    return () => window.removeEventListener("user-updated", readUser);
}, []);

  const showTopbarSkeleton = !userHydrated || orgLoading || !orgReady;

  const loadNotifications = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoadingNotifications(true);
    try {
      const scope = currentOrgId
        ? { organizationId: currentOrgId }
        : { personal: true };

      const [summary, recent] = await Promise.all([
        fetchNotificationSummary(scope),
        fetchNotifications({ limit: 10, ...scope }),
      ]);
      setUnreadCount(summary.unreadCount ?? 0);
      setNotifications(recent);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoadingNotifications(false);
    }
  }, [currentOrgId]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    const onUpdated = () => loadNotifications();
    const onWorkspaceChange = () => loadNotifications();
    window.addEventListener("notifications-updated", onUpdated);
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("notifications-updated", onUpdated);
      window.removeEventListener("workspace-changed", onWorkspaceChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (showNotifications) loadNotifications();
  }, [showNotifications, loadNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Select's open menu renders via a portal into document.body (so it
      // can float above everything), which means it's not a DOM descendant
      // of profileRef even when it belongs to a dropdown nested inside the
      // profile menu (e.g. StatusMenu's duration pickers) — without this
      // check, clicking an option in one of those menus looked like a
      // click "outside" and closed the whole profile menu underneath it.
      if (target.closest(".dropdown-pop")) {
        return;
      }

      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setShowProfileMenu(false);
      }

      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }

      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
  };

  const openFullSearch = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    setShowSearchDropdown(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const closeSearchDropdown = () => {
    setShowSearchDropdown(false);
  };

  const handleMarkAllRead = async () => {
    const res = await markAllNotificationsRead();
    if (res.ok) {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.read) {
      const res = await markNotificationRead(item._id);
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n._id !== item._id));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    }

    setShowNotifications(false);
    if (item.link) {
      router.push(item.link);
    } else {
      router.push("/inbox");
    }
  };

  const showDropdown = showSearchDropdown && search.trim();

  return (
<header className="app-topbar fixed top-0 left-0 right-0 z-50 h-[72px] bg-white/90 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 gap-2 sm:gap-6 dark:bg-slate-900/90 dark:border-slate-800">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
          className="lg:hidden h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Menu size={20} />
        </button>
        {showTopbarSkeleton ? (
          <div className="flex items-center gap-2" aria-hidden>
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="skeleton h-5 w-24 rounded hidden sm:block" />
            <div className="skeleton h-8 w-8 rounded-full lg:hidden" />
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
              {orgLogoSrc ? (
                <img
                  src={orgLogoSrc}
                  alt={currentOrg?.name || "Organization"}
                  className="h-10 w-auto max-w-[9rem] md:h-12 md:max-w-[11rem] object-contain"
                />
              ) : (
                <>
                  <Logo className="w-10 h-10 md:w-12 md:h-12" />
                  <h1 className="hidden sm:block text-lg md:text-xl font-bold text-slate-900 tracking-tight dark:text-white">
                    WriTask
                  </h1>
                </>
              )}
            </Link>
            {/* Mobile: keep icon beside brand */}
            <div className="lg:hidden">
              <OrgSwitcher />
            </div>
          </div>
        )}
      </div>

      {/* Desktop: sit on the sidebar / content border (sidebar is w-72) */}
      {!showTopbarSkeleton && (
        <div className="hidden lg:block absolute left-[15rem] top-1/2 z-[60] -translate-y-1/2">
          <OrgSwitcher />
        </div>
      )}

      <div className="relative w-full max-w-[420px] hidden md:block" ref={searchRef}>
        {showTopbarSkeleton ? (
          <div className="skeleton h-10 w-full rounded-full" aria-hidden />
        ) : (
          <>
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          type="search"
          name="global-search"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          placeholder="Search projects, tasks, members..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowSearchDropdown(true);
          }}
          onFocus={() => {
            if (search.trim()) setShowSearchDropdown(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              openFullSearch();
            }
            if (e.key === "Escape") {
              setShowSearchDropdown(false);
            }
          }}
          className="w-full h-10 rounded-full border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-cyan-500/20"
        />

        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-[70vh] overflow-y-auto z-50 dark:bg-slate-900 dark:border-slate-800">
            <SearchResultsList
              query={search}
              results={results}
              isReady={isReady}
              compact
              showFooter
              onNavigate={closeSearchDropdown}
            />
          </div>
        )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {showTopbarSkeleton ? (
          <div className="flex items-center gap-2 sm:gap-3" aria-busy="true" aria-label="Loading toolbar">
            <div className="skeleton h-10 w-10 rounded-full shrink-0" />
            <div className="skeleton h-10 w-10 rounded-full shrink-0" />
            <div className="flex items-center gap-2.5 pl-1 pr-1">
              <div className="skeleton h-9 w-9 rounded-full shrink-0" />
              <div className="hidden md:block space-y-1.5">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-2.5 w-32 rounded" />
              </div>
            </div>
          </div>
        ) : (
          <>
        <Link
          href="/search"
          aria-label="Search"
          className="md:hidden h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Search size={18} />
        </Link>
        <div className="relative shrink-0" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            className="relative h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"          >
            <Bell size={18} />
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                {notifications.filter((n) => !n.read).length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="fixed left-4 right-4 top-19 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 dark:bg-slate-900 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center gap-2 dark:border-slate-800">
                <h3 className="text-slate-800 font-semibold dark:text-slate-100">Notifications</h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-blue-600 hover:bg-blue-50 transition-colors px-2.5 py-1 rounded-md text-xs font-medium dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                  >
                    Mark all read
                  </button>
                  <Link
                    href="/inbox"
                    onClick={() => setShowNotifications(false)}
                    className="text-blue-600 hover:bg-blue-50 transition-colors px-2.5 py-1 rounded-md text-xs font-medium dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                  >
                    Open inbox
                  </Link>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto no-scrollbar momentum-scroll">
                {loadingNotifications ? (
                  <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading notifications">
                    {[0.9, 0.75, 0.85].map((w, i) => (
                      <div key={i} className="space-y-2 px-1 py-1">
                        <div className="skeleton h-3.5 rounded" style={{ width: `${w * 100}%` }} />
                        <div className="skeleton h-3 w-2/3 rounded" />
                        <div className="skeleton h-2.5 w-1/3 rounded" />
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="p-6 text-center text-slate-400 text-sm dark:text-slate-500">
                    You&apos;re all caught up
                  </p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full text-left px-5 py-3.5 border-b border-slate-100 last:border-none hover:bg-slate-50 transition-colors dark:border-slate-800 dark:hover:bg-slate-800 ${
                        !item.read ? "bg-cyan-50/60 dark:bg-cyan-500/10" : ""
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <h4 className="text-slate-800 text-sm font-medium truncate dark:text-slate-100">
                          {item.title}
                        </h4>
                        {!item.read && (
                          <span className="w-2 h-2 bg-cyan-500 rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5 dark:text-slate-500">
                        {actorName(item)}
                      </p>
                      <p className="text-slate-500 text-sm mt-1 line-clamp-2 dark:text-slate-400">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${typeBadgeClass(item.type)}`}
                        >
                          {
                            NOTIFICATION_TYPE_LABELS[
                              item.type as NotificationType
                            ]
                          }
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {formatNotificationTime(item.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative shrink-0" ref={profileRef}>
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
          >
            <UserAvatar
              name={user?.username}
              color={user?.avatarColor}
              seed={user?.id || user?.email || user?.username || "user"}
              size={36}
              userId={user?.id}
              showStatus
            />

           <div className="text-left hidden md:block">
              <h3 className="text-slate-900 font-semibold text-sm leading-tight dark:text-white">{user?.username || "User"}</h3>
              <p className="text-slate-400 text-xs dark:text-slate-500">{user?.email || ""}</p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="fixed left-4 right-4 top-19 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-72 max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl z-50 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <StatusMenu />
              <Link
                href="/settings/account"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                Account info
              </Link>
              <Link
                href="/profile/edit"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                Edit profile
              </Link>
              <Link
                href="/change-password"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                Change password
              </Link>

              <div className="my-1.5 border-t border-slate-200 dark:border-slate-800" />
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                Logout
              </button>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </header>
  );
}
