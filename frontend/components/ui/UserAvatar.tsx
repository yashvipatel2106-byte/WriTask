"use client";

import { useEffect } from "react";
import { avatarColor } from "@/lib/avatarColor";
import { usePresence } from "@/components/context/PresenceProvider";
import StatusBadge from "@/components/ui/StatusBadge";

export default function UserAvatar({
  name,
  color,
  seed,
  size = 36,
  className = "",
  userId,
  showStatus = false,
}: {
  name?: string | null;
  color?: string | null; // custom hex or CSS gradient; falls back when empty
  seed?: string | null;
  size?: number;
  className?: string;
  /** When provided with showStatus, renders a small presence badge bottom-right. */
  userId?: string | null;
  showStatus?: boolean;
}) {
  const initial = (name?.trim()?.charAt(0) || "U").toUpperCase();
  const useCustom = !!color;

  const { getStatus, ensureTracked } = usePresence();

  useEffect(() => {
    if (showStatus && userId) ensureTracked([userId]);
  }, [showStatus, userId, ensureTracked]);

  const status = showStatus ? getStatus(userId) : null;
  const badgeSize = Math.max(10, Math.round(size * 0.32));

  return (
    <div
      className={`relative rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${
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
      {showStatus && userId && (
        <StatusBadge status={status} size={badgeSize} />
      )}
    </div>
  );
}