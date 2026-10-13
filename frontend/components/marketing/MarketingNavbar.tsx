"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Logo from "@/components/ui/Logo";

type Props = {
  /** Renders a search input in the navbar (used on the FAQ page). */
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

/**
 * Shared navbar for public marketing pages (home, FAQ, ...). Kept visually
 * identical to the original home-page navbar so every marketing page reads
 * as one consistent site, regardless of which page renders it.
 */
export default function MarketingNavbar({
  showSearch = false,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search FAQs...",
}: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors ${
        scrolled
          ? "border-slate-200 bg-[#eaf2ff]/90 shadow-sm backdrop-blur-md"
          : "border-transparent bg-[#eaf2ff]/75 backdrop-blur"
      }`}
    >
      <div className="mx-auto max-w-[1240px] px-6">
        <nav className="flex h-[70px] items-center justify-between gap-4">
          <Link href="/home" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Logo staysLight className="h-10 w-10 sm:h-15 sm:w-15" />
            <span className="wt-display hidden sm:block text-[22px] font-extrabold tracking-tight text-slate-900">
              WriTask
            </span>
          </Link>

          {showSearch && (
            <div className="relative hidden w-full max-w-[380px] md:block">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-10 rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-cyan-600 px-4 sm:px-5 py-2.5 text-sm text-white font-semibold shadow-sm transition-all duration-200 hover:bg-cyan-700 hover:shadow-md"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-cyan-600 px-4 sm:px-5 py-2.5 text-sm text-white font-semibold shadow-sm transition-all duration-200 hover:bg-cyan-700 hover:shadow-md"
            >
              Sign up
            </Link>
          </div>
        </nav>

        {/* Search gets its own row on narrow screens instead of squeezing the
            buttons above off-screen. */}
        {showSearch && (
          <div className="relative pb-3 md:hidden">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-10 rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-all"
            />
          </div>
        )}
      </div>
    </header>
    {/* Fixed headers are removed from normal flow — this spacer reserves the
        same height so page content doesn't start out hidden underneath it.
        Taller on mobile when showSearch adds its own row below the main nav. */}
    <div className={showSearch ? "h-[122px] md:h-[70px]" : "h-[70px]"} aria-hidden="true" />
    </>
  );
}
