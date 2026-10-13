"use client";

import { useMemo, useState } from "react";
import { HelpCircle, SearchX } from "lucide-react";
import MarketingNavbar from "@/components/marketing/MarketingNavbar";
import ConstellationCanvas from "@/components/marketing/ConstellationCanvas";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";
import { FAQ_CATEGORIES, type FaqItem } from "@/lib/faqData";

function FaqCard({ item }: { item: FaqItem }) {
  const Icon = item.icon;
  // Hover alone (the old `group-hover` approach) never triggers on
  // touch devices — tablets/phones have no persistent :hover state, so the
  // answer stayed permanently collapsed there. Click/tap now drives it
  // everywhere; hover is layered on top as a bonus for mouse users.
  const [open, setOpen] = useState(false);

  return (
    <div className="group py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3.5 text-left hover:cursor-pointer"
      >
        <span
          className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-200 group-hover:bg-cyan-500/15 group-hover:text-cyan-600 ${
            open ? "bg-cyan-500/15 text-cyan-600" : "bg-blue-500/10 text-blue-600"
          }`}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-slate-900">
            {item.question}
          </p>
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out group-hover:grid-rows-[1fr] ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <p className="pt-2 text-[14px] leading-relaxed text-slate-500">
                {item.answer}
              </p>
              {item.link && (
                <a
                  href={item.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 inline-block text-[14px] font-semibold text-cyan-600 hover:text-cyan-700 hover:underline"
                >
                  {item.link.label} &rarr;
                </a>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function FaqPage() {
  useAllowPageScroll();
  const [search, setSearch] = useState("");

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return FAQ_CATEGORIES;

    return FAQ_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
      ),
    })).filter((category) => category.items.length > 0);
  }, [search]);

  return (
    <div
      className="min-h-screen bg-[#F6F9FC] text-slate-900"
      style={{ fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`
        .wt-display { font-family: var(--font-display), ui-sans-serif, system-ui, sans-serif; }
      `}</style>

      <ConstellationCanvas />

      <div className="relative z-10">
        <MarketingNavbar showSearch searchValue={search} onSearchChange={setSearch} />

        <main className="mx-auto max-w-[1240px] px-6 py-10 lg:py-14">
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/85 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-2xl sm:p-12">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-600 shadow-sm">
          <HelpCircle size={13} />
          FAQs
        </span>

        <h1 className="wt-display mt-5 text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-[-.02em] text-slate-900">
          Frequently asked questions
        </h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-slate-500">
          Stuck on something? We&apos;re here to help with all your questions and answers in one place.
        </p>

        {visibleCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <SearchX size={32} className="text-slate-300" />
            <p className="text-slate-500">
              No results found for &quot;{search}&quot;.
            </p>
          </div>
        ) : (
          <div className="mt-14 space-y-14">
            {visibleCategories.map((category) => {
              const CategoryIcon = category.icon;
              return (
              <div key={category.title}>
                <h2 className="mb-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-50 to-blue-50 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-cyan-700 ring-1 ring-cyan-600/10">
                  <CategoryIcon size={14} />
                  {category.title}
                </h2>
                <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
                  {category.items.map((item) => (
                    <FaqCard key={item.question} item={item} />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
        </div>
        </main>
      </div>
    </div>
  );
}
