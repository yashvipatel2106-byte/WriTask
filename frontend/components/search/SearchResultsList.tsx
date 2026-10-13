"use client";

import Link from "next/link";
import {
  Briefcase,
  Calendar,
  CheckSquare,
  Search,
  Users,
} from "lucide-react";
import SearchHighlight from "./SearchHighlight";
import {
  countSearchResults,
  getSearchResultHref,
  type SearchResults,
} from "@/lib/searchApi";

type Props = {
  query: string;
  results: SearchResults;
  isReady?: boolean;
  compact?: boolean;
  showFooter?: boolean;
  onNavigate?: () => void;
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wide font-semibold text-cyan-700/80 flex items-center gap-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  href,
  query,
  title,
  subtitle,
  onNavigate,
}: {
  href: string;
  query: string;
  title: string;
  subtitle?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="block px-4 py-2.5 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
    >
      <p className="text-sm text-slate-900 dark:text-slate-100">
        <SearchHighlight text={title} query={query} />
      </p>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-0.5 truncate dark:text-slate-400">
          <SearchHighlight text={subtitle} query={query} />
        </p>
      )}
    </Link>
  );
}

export default function SearchResultsList({
  query,
  results,
  isReady = true,
  compact = false,
  showFooter = false,
  onNavigate,
}: Props) {
  const total = countSearchResults(results);
  const trimmed = query.trim();

  if (!trimmed || !isReady) return null;

  if (total === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-center px-6 ${
          compact ? "py-8" : "py-16"
        }`}
      >
        <Search size={28} className="text-slate-300 mb-3 dark:text-slate-600" />
        <p className="text-sm text-slate-600 dark:text-slate-300">No results for &quot;{trimmed}&quot;</p>
        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
          Try another keyword or press Enter to open the full search page.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "max-h-[420px] overflow-y-auto" : ""}>
      {results.projects.length > 0 && (
        <Section title="Projects" icon={<Briefcase size={12} />}>
          {results.projects.map((project) => (
            <ResultRow
              key={project._id}
              href={getSearchResultHref("project", project)}
              query={trimmed}
              title={project.title}
              subtitle={
                project.organization?.name
                  ? project.organization.name
                  : project.description
              }
              onNavigate={onNavigate}
            />
          ))}
        </Section>
      )}

      {results.tasks.length > 0 && (
        <Section title="Tasks" icon={<CheckSquare size={12} />}>
          {results.tasks.map((task) => (
            <ResultRow
              key={task._id}
              href={getSearchResultHref("task", task)}
              query={trimmed}
              title={task.title}
              subtitle={
                task.project?.title
                  ? `${task.project.title}${task.status ? ` · ${task.status}` : ""}`
                  : task.description
              }
              onNavigate={onNavigate}
            />
          ))}
        </Section>
      )}

      {results.members.length > 0 && (
        <Section title="Members" icon={<Users size={12} />}>
          {results.members.map((member) => (
            <ResultRow
              key={member._id}
              href={getSearchResultHref("member", member)}
              query={trimmed}
              title={member.username}
              subtitle={
                member.designation ||
                member.department ||
                member.email ||
                undefined
              }
              onNavigate={onNavigate}
            />
          ))}
        </Section>
      )}

      {results.calendar.length > 0 && (
        <Section title="Calendar" icon={<Calendar size={12} />}>
          {results.calendar.map((event) => (
            <ResultRow
              key={event._id}
              href={getSearchResultHref("calendar", event)}
              query={trimmed}
              title={event.title}
              subtitle={
                [event.date, event.organization?.name, event.type]
                  .filter(Boolean)
                  .join(" · ") || event.description
              }
              onNavigate={onNavigate}
            />
          ))}
        </Section>
      )}

      {showFooter && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <Link
            href={`/search?q=${encodeURIComponent(trimmed)}`}
            onClick={onNavigate}
            className="text-sm text-cyan-700 hover:text-cyan-600"
          >
            View all results for &quot;{trimmed}&quot;
          </Link>
        </div>
      )}
    </div>
  );
}
