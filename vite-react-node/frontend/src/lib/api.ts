import { getSessionToken } from "./session";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Calls the backend service with the Forte session token as a Bearer header. The Forte gateway
// validates the token and passes the user's id to the service in X-Forte-User-Id. The website has
// no FORTE_API_TOKEN, so every privileged call goes through the service.
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!BACKEND_URL) {
    throw new Error(
      "VITE_BACKEND_URL is not set. Point it at your backend service URL " +
        "(locally, `forte proxy` on http://localhost:8080).",
    );
  }
  const token = getSessionToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
}
