"use client";

import { avatarColor } from "@/lib/avatarColor";

export default function UserAvatar({
  name,
  color,
  seed,
  size = 36,
  className = "",
}: {
  name?: string | null;
  color?: string | null; // custom hex or CSS gradient; falls back when empty
  seed?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = (name?.trim()?.charAt(0) || "U").toUpperCase();
  const useCustom = !!color;

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${
        useCustom ? "" : avatarColor(seed || name || "user")
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        ...(useCustom ? { background: color as string } : {}),
      }}
    >
      {initial}
    </div>
  );
}