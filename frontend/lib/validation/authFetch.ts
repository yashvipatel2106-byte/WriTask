import { apiUrl } from "@/lib/validation/api";
import { clearAuthStorage } from "@/lib/validation/authStorage";

/** 401s that mean the session itself is dead — not business errors like a wrong org password. */
function isSessionInvalidMessage(message: unknown): boolean {
  const msg = String(message || "").toLowerCase();
  return (
    msg === "invalid token" ||
    msg === "user not found" ||
    msg === "no token provided" ||
    msg.includes("jwt") ||
    msg.includes("token expired")
  );
}

export class NetworkError extends Error {
  constructor(message = "Failed to fetch") {
    super(message);
    this.name = "NetworkError";
  }
}

export async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(apiUrl(endpoint), {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    console.error(
      `[authFetch] Network error for ${apiUrl(endpoint)}. Is the backend reachable?`,
      error
    );
    throw new NetworkError();
  }

  // Only wipe the session on real auth failures. A wrong organization password
  // (and similar) also returns 401 historically — clearing the token there left
  // the UI showing "No token provided" on the next switch/login attempt.
  if (response.status === 401 && token && typeof window !== "undefined") {
    try {
      const data = await response.clone().json();
      if (isSessionInvalidMessage(data?.message)) {
        clearAuthStorage();
      }
    } catch {
      /* ignore non-JSON bodies */
    }
  }

  return response;
}
