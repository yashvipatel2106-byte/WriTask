import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WriTask — Plan. Collaborate. Deliver. On time.",
  description:
    "WriTask helps teams manage projects, tasks and workflows in one unified workspace. Stay organized, aligned and productive.",
};

// NOTE: no <html>/<body> here — the root app/layout.tsx already provides them.
// This nested layout only scopes the marketing fonts to the /home route.
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${sans.variable} ${display.variable}`}>{children}</div>;
}