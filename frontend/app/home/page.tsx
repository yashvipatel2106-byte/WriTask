"use client";

import Link from "next/dist/client/link";
import { useEffect, useRef, type CSSProperties } from "react";
import MarketingNavbar from "@/components/marketing/MarketingNavbar";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { useAllowPageScroll } from "@/hooks/useAllowPageScroll";

/* ============================================================
   WriTask — Home page (Logo + Navbar + Hero + Mockup + Features + Footer)
   All previously-separate components are combined into this one file.
   ============================================================ */

/* ---------- shared icons ---------- */
const PeopleIcon = ({ className = "h-[18px] w-[18px]" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);


/* ============================================================
   Animated dashboard mockup
   ============================================================ */
type Row = { label: string; color: string; left: string; w: string; delay: string };
const rows: Row[] = [
  { label: "Research",    color: "bg-sky-400",     left: "left-[6%]",  w: "24%", delay: ".5s" },
  { label: "Planning",    color: "bg-blue-500",    left: "left-[28%]", w: "26%", delay: ".62s" },
  { label: "Design",      color: "bg-emerald-400", left: "left-[40%]", w: "26%", delay: ".74s" },
  { label: "Development", color: "bg-violet-500",  left: "left-[54%]", w: "20%", delay: ".86s" },
  { label: "Testing",     color: "bg-orange-400",  left: "left-[66%]", w: "16%", delay: ".98s" },
  { label: "Launch",      color: "bg-teal-500",    left: "left-[72%]", w: "18%", delay: "1.1s" },
];

type AvatarProps = { initial: string; gradient: string; size?: string; delay: string };
const Avatar = ({ initial, gradient, size = "h-8 w-8", delay }: AvatarProps) => (
  <span
    className={`pop grid ${size} place-items-center rounded-full bg-gradient-to-br ${gradient} text-[13px] font-bold text-white ring-2 ring-white`}
    style={{ animationDelay: delay }}
  >
    {initial}
  </span>
);

function AnimatedMockup() {
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = pctRef.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = "75%";
      return;
    }
    let start: number | null = null;
    const dur = 1500;
    const target = 75;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.round(p * target) + "%";
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const t = window.setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, 300);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[600px]">
      <div className="relative aspect-[600/540] w-full text-slate-900">
        {/* connectors */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 540" fill="none" aria-hidden="true">
          <path id="c1" className="conn" d="M150 150 C 70 200, 70 280, 120 320" stroke="#7cc4ff" strokeWidth={2} />
          <path id="c2" className="conn" d="M300 300 C 300 360, 330 400, 360 430" stroke="#7cc4ff" strokeWidth={2} />
          <path id="c3" className="conn" d="M470 430 C 520 410, 545 360, 545 330" stroke="#7cc4ff" strokeWidth={2} />
          <circle r="4.5" fill="#2E90FA"><animateMotion dur="3.2s" repeatCount="indefinite"><mpath href="#c1" /></animateMotion></circle>
          <circle r="4.5" fill="#2E90FA"><animateMotion dur="3.2s" repeatCount="indefinite" begin="1s"><mpath href="#c2" /></animateMotion></circle>
          <circle r="4.5" fill="#2E90FA"><animateMotion dur="3.2s" repeatCount="indefinite" begin="2s"><mpath href="#c3" /></animateMotion></circle>
          <circle cx="120" cy="320" r="4" fill="#2E90FA" />
          <circle cx="360" cy="430" r="4" fill="#2E90FA" />
        </svg>

        {/* dot grid */}
        <svg className="absolute right-[3%] top-[16%] h-24 w-24" viewBox="0 0 100 100" aria-hidden="true">
          <g fill="#9cc7ff">
            {[10, 30, 50].map((cy, r) =>
              [10, 30, 50, 70, 90].map((cx, c) => (
                <circle key={`${r}-${c}`} cx={cx} cy={cy} r={3.4} className="animate-[twinkle_3s_ease-in-out_infinite]" style={{ animationDelay: `${(r * 5 + c) * 0.1}s` }} />
              ))
            )}
          </g>
        </svg>

        <span className="absolute right-[8%] top-[46%] h-16 w-16 animate-[breathe_5s_ease-in-out_infinite] rounded-full bg-blue-500/10" />

        {/* Project Planning */}
        <div className="entrance absolute left-[20%] top-[1%] w-[64%]" style={{ animationDelay: ".15s" }}>
          <div className="floaty rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(46,144,250,.35)]" style={{ animationDuration: "6.5s" }}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <p className="wt-display text-[16px] font-bold">Project Planning</p>
            </div>

            <div className="mt-4 grid grid-cols-4 text-[11px] font-medium text-slate-400">
              <span>May 18</span><span>May 25</span><span>Jun 1</span><span>Jun 8</span>
            </div>

            <div className="mt-2 space-y-[9px]">
              {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[92px_1fr] items-center gap-2">
                  <span className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
                    <i className={`h-2 w-2 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="relative h-[9px]">
                    <span className={`gbar ${row.left} ${row.color}`} style={{ "--w": row.w, animationDelay: row.delay } as CSSProperties} />
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center">
              <span className="-mr-2"><Avatar initial="M" gradient="from-rose-300 to-rose-500" delay=".9s" /></span>
              <span className="-mr-2"><Avatar initial="R" gradient="from-amber-300 to-orange-500" delay="1s" /></span>
              <span className="-mr-2"><Avatar initial="J" gradient="from-sky-300 to-blue-500" delay="1.1s" /></span>
              <span className="pop grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 ring-2 ring-white" style={{ animationDelay: "1.2s" }}>+3</span>
            </div>
          </div>
        </div>

        {/* Team Collaboration */}
        <div className="entrance absolute left-0 top-[58%] w-[46%]" style={{ animationDelay: ".3s" }}>
          <div className="floaty rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(46,144,250,.35)]" style={{ animationDuration: "7.5s", animationDelay: ".4s" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><PeopleIcon /></span>
              <p className="wt-display text-[15px] font-bold">Team Collaboration</p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Avatar initial="S" gradient="from-teal-300 to-cyan-500" size="h-11 w-11" delay=".7s" />
              <Avatar initial="A" gradient="from-indigo-300 to-blue-600" size="h-11 w-11" delay=".8s" />
              <Avatar initial="K" gradient="from-fuchsia-300 to-purple-600" size="h-11 w-11" delay=".9s" />
              <span className="pop grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400" style={{ animationDelay: "1s" }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-rose-300 to-pink-500 text-[12px] font-bold text-white">A</span>
              <div className="leading-tight">
                <p className="text-[12.5px]"><b className="font-bold">Alex</b> <span className="text-slate-500">updated the design</span></p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400"><i className="livedot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />2 min ago</p>
              </div>
            </div>
          </div>
        </div>

        {/* Task Progress */}
        <div className="entrance absolute right-0 top-[60%] w-[42%]" style={{ animationDelay: ".42s" }}>
          <div className="floaty rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(46,144,250,.35)]" style={{ animationDuration: "6.8s", animationDelay: ".8s" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><PeopleIcon /></span>
              <p className="wt-display text-[15px] font-bold">Task Progress</p>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-[86px] w-[86px]">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e8eef7" strokeWidth={10} className="" />
                  <circle className="ringprog" cx="50" cy="50" r="42" fill="none" stroke="url(#pg)" strokeWidth={10} strokeLinecap="round" />
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#1BB8E6" /><stop offset="1" stopColor="#2E90FA" />
                    </linearGradient>
                  </defs>
                </svg>
                <span ref={pctRef} className="wt-display absolute inset-0 grid place-items-center text-[18px] font-extrabold">75%</span>
              </div>
              <div>
                <p className="wt-display text-[22px] font-extrabold leading-none">75%</p>
                <p className="text-[12.5px] text-slate-500">Completed</p>
                <div className="mt-3 h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div className="barprog h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600" style={{ width: 0 }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Great progress */}
        <div className="entrance absolute bottom-[1%] left-[38%] w-[40%]" style={{ animationDelay: ".55s" }}>
          <div className="floaty rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_24px_60px_-24px_rgba(46,144,250,.35)]" style={{ animationDuration: "5.8s", animationDelay: ".3s" }}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-600">
                <svg className="h-5 w-5 origin-top animate-[bellRing_4s_ease-in-out_infinite]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
              </span>
              <div className="leading-tight">
                <p className="wt-display text-[14px] font-bold">Great progress! <span className="inline-block animate-[wiggle_3s_ease-in-out_infinite]">🎉</span></p>
                <p className="text-[12.5px] text-slate-500">Keep going, team!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Hero
   ============================================================ */
const valueProps = [
  { title: "Smart Collaboration", text: "Work together in real time", icon: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { title: "Clear Visibility", text: "Track progress instantly", icon: (<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>) },
  { title: "Secure & Reliable", text: "Your data, always safe", icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /> },
];

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_80%_0%,#eaf2ff_0%,#f6f9ff_45%,#ffffff_100%)]">
      {/* soft creative accent blob */}
      <div aria-hidden className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:gap-6 lg:py-20">
        <div>
          <span className="entrance inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[.12em] text-blue-600" style={{ animationDelay: ".02s" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> All-in-one work management
          </span>

          <h1 className="wt-display entrance mt-5 text-[clamp(2.6rem,5.2vw,4.1rem)] font-extrabold leading-[1.04] tracking-[-.03em]" style={{ animationDelay: ".08s" }}>
            Plan. Organize.<br />
            <span className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">Collaborate.</span> Deliver.
          </h1>

          <p className="entrance mt-6 max-w-[30rem] text-[18px] leading-relaxed text-slate-500" style={{ animationDelay: ".16s" }}>
            WriTask simplifies project and task management by bringing planning, collaboration, and progress tracking into one powerful workspace. Keep your team organized, aligned, and productive from start to finish.
          </p>

          <div className="entrance mt-8 flex flex-wrap items-center gap-4" style={{ animationDelay: ".24s" }}>
            <a href="/signup" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r bg-cyan-600 hover:bg-cyan-700 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/30">
              Get started free
              <svg className="h-4 w-4 transition group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </a>
            <Link href="/faq" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              FAQs
            </Link>
          </div>

          <div className="entrance mt-10 grid max-w-[34rem] grid-cols-1 gap-5 sm:grid-cols-3" style={{ animationDelay: ".32s" }}>
            {valueProps.map((v) => (
              <div key={v.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{v.icon}</svg>
                </span>
                <div>
                  <p className="text-[14px] font-bold leading-tight">{v.title}</p>
                  <p className="text-[12.5px] text-slate-500">{v.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <AnimatedMockup />
      </div>
    </section>
  );
}

/* ============================================================
   Feature strip
   ============================================================ */

/* ============================================================
   Page
   ============================================================ */
export default function HomePage() {
  useAllowPageScroll();

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" }}>
      {/* scoped font + base styles for this page */}
      <style>{`
        .wt-display { font-family: var(--font-display), ui-sans-serif, system-ui, sans-serif; }
      `}</style>

      <MarketingNavbar />
      <main>
        <Hero />
      </main>
      <MarketingFooter />
    </div>
  );
}