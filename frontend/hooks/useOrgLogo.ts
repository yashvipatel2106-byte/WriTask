"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/validation/authFetch";

const logoObjectUrls = new Map<string, string>();

function cacheKey(orgId: string, logoUpdatedAt?: string | null) {
  return `${orgId}:${logoUpdatedAt || "0"}`;
}

export function clearOrgLogoCache(orgId?: string) {
  for (const [key, url] of logoObjectUrls.entries()) {
    if (!orgId || key.startsWith(`${orgId}:`)) {
      URL.revokeObjectURL(url);
      logoObjectUrls.delete(key);
    }
  }
}

export function useOrgLogoSrc(
  orgId: string | null | undefined,
  hasLogo: boolean | undefined,
  logoUpdatedAt?: string | null
) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !hasLogo) {
      setSrc(null);
      return;
    }

    const key = cacheKey(orgId, logoUpdatedAt);
    const cached = logoObjectUrls.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }

    let cancelled = false;
    const stamp = encodeURIComponent(logoUpdatedAt || Date.now().toString());

    void authFetch(`/organizations/${orgId}/logo?t=${stamp}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        const type = res.headers.get("content-type") || blob.type;
        if (type && type !== blob.type) return new Blob([blob], { type });
        return blob;
      })
      .then((blob) => {
        if (cancelled || !blob) {
          if (!cancelled) setSrc(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        logoObjectUrls.set(key, url);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, hasLogo, logoUpdatedAt]);

  return src;
}
