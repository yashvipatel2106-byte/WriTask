import { apiUrl } from "@/lib/validation/api";
import { clearAuthStorage } from "@/lib/validation/authStorage";

export async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(apiUrl(endpoint), {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && token && typeof window !== "undefined") {
    clearAuthStorage();
  }

  return response;
}
