"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

type SidebarCtx = {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  projectsOpen: boolean;
  toggleProjects: () => void;
};

const SidebarContext = createContext<SidebarCtx | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  // Lives here (not as local state in Sidebar) because Sidebar is rendered
  // per-page rather than once in the root layout — every navigation remounts
  // it, which would otherwise reset this and close the dropdown on its own.
  // Only a manual click on the chevron should close it.
  const [projectsOpen, setProjectsOpen] = useState(false);
  const toggleProjects = useCallback(() => setProjectsOpen((o) => !o), []);

  // Close the mobile/tablet drawer whenever the route changes.
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Drop any leftover open state once the viewport reaches the desktop
  // breakpoint, where the sidebar is always visible and the drawer state is moot.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mql.matches) close();
    };
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [close]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, projectsOpen, toggleProjects }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}
