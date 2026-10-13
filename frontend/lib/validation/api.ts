/**
 * Normalize API base — always ends with /api.
 *
 * Local: NEXT_PUBLIC_API_URL or http://localhost:5000/api
 * Dev Tunnel: if the page is on *-3000.*.devtunnels.ms, call *-5000.*.devtunnels.ms
 * so other devices don't hit their own localhost.
 */
export function getApiBaseUrl(): string {
  let base =
    process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:5000/api";

  if (typeof window !== "undefined") {
    const match = window.location.hostname.match(
      /^(.+)-3000(\..+\.devtunnels\.ms)$/i
    );
    if (match) {
      base = `${window.location.protocol}//${match[1]}-5000${match[2]}/api`;
    }
  }

  base = base.replace(/\/+$/, "");

  if (!base.endsWith("/api")) {
    base = `${base}/api`;
  }

  return base;
}

/** Backend origin without /api (for Socket.IO, etc.) */
export function getServerOrigin(): string {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}

export const API_BASE_URL = getApiBaseUrl();

/** Build full API URL: apiUrl("/auth/login") → …/api/auth/login */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalized}`;
}

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = apiUrl(endpoint);

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    return response;
  } catch (error) {
    console.error(
      `[fetchAPI] Network error for ${url}. Is the backend reachable?`,
      error
    );
    throw error;
  }
}
