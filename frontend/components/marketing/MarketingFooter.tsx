"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, ArrowRight } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import Logo from "@/components/ui/Logo";
import ContactSupportModal from "@/components/marketing/ContactSupportModal";

export default function MarketingFooter() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <footer className="bg-white">
      <div className="mx-auto max-w-[1240px] px-6 py-9">
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <Logo staysLight className="h-7 w-7" />
              <span className="wt-display text-[16px] font-extrabold tracking-tight text-slate-900">
                WriTask
              </span>
            </div>
            <p className="mt-2.5 max-w-xs text-xs leading-relaxed text-slate-500">
              Plan, collaborate, and deliver on time — a unified workspace to keep your team
              organized and moving forward.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
              Quick Links
            </p>
            <ul className="mt-2.5 space-y-1.5 text-xs">
              <li>
                <Link href="/faq" className="text-slate-600 transition hover:text-cyan-600">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-slate-600 transition hover:text-cyan-600">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-slate-600 transition hover:text-cyan-600">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
              Support
            </p>
            <div className="mt-2.5 flex flex-col items-start gap-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="group inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-cyan-600"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-cyan-500/10 text-cyan-600">
                  <Mail size={12} />
                </span>
                Contact us on mail
              </a>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="group inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-700 hover:shadow-md hover:shadow-cyan-500/30"
              >
                <MessageCircle size={12} />
                Contact Us
                <ArrowRight size={11} className="transition group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} WriTask. All rights reserved.</p>
          <p>Plan. Collaborate. Deliver.</p>
        </div>
      </div>

      {contactOpen && <ContactSupportModal onClose={() => setContactOpen(false)} />}
    </footer>
  );
}
