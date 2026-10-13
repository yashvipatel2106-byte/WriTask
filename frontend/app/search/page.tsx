"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";
import SearchResultsList from "@/components/search/SearchResultsList";
import { useSearchQuery } from "@/lib/useSearchQuery";
import { Search } from "lucide-react";

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const { results, isReady } = useSearchQuery(query, 20, 150);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 min-h-0 ml-0 lg:ml-70 mt-18 h-[calc(100vh-72px)] overflow-y-auto overscroll-contain bg-[#F6F9FC] text-slate-900 p-10 dark:bg-slate-950 dark:text-slate-100">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">Search</h1>
            <p className="text-slate-500 text-sm mb-6 dark:text-slate-400">
              Search across projects, tasks, members, and calendar events you
              have access to.
            </p>

            <div className="relative mb-6">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                }}
                placeholder="Search projects, tasks, members, calendar..."
                className="w-full bg-white border border-slate-200 shadow-sm rounded-2xl pl-12 pr-5 py-4 text-slate-900 outline-none focus:border-cyan-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:focus:border-cyan-500"
                autoFocus
              />
            </div>

            {query.trim() ? (
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden min-h-[120px] dark:bg-slate-900 dark:border-slate-800">
                <SearchResultsList
                  query={query}
                  results={results}
                  isReady={isReady}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl px-6 py-16 text-center text-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500">
                Start typing to search your workspace.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center text-slate-400 dark:bg-slate-950 dark:text-slate-500">
          Loading search...
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
