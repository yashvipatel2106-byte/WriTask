"use client";

import { Fragment } from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Props = {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
};

export default function SearchHighlight({
  text,
  query,
  className,
  highlightClassName = "bg-cyan-100 text-cyan-800 rounded px-0.5 dark:bg-cyan-500/20 dark:text-cyan-300",
}: Props) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, "gi");
  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={index} className={highlightClassName}>
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </span>
  );
}
