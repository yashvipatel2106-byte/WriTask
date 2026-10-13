import { apiUrl } from "@/lib/validation/api";

/**
 * Authenticated JSON fetch used by leave/calendar API modules.
 * Throws on network/HTTP errors (same behavior as the previous per-file helpers).
 */
export async function authJsonFetch<T>(
  path: string,
  options: RequestInit = {},
  resourceLabel = "Request"
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "Unable to reach the server. Check that the backend is running."
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { message?: string }).message ||
        `${resourceLabel} failed (${res.status})`
    );
  }
  return json as T;
}
