import { getSessionToken } from "./session";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Calls the backend *service*. The browser attaches the Forte session token as a Bearer header;
// in production the Forte gateway validates it and tells the service who the user is (it injects
// a trusted X-Forte-User-Id header). The website itself has no server runtime and no
// FORTE_API_TOKEN — every privileged operation happens in the service.
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!BACKEND_URL) {
    throw new Error(
      "VITE_BACKEND_URL is not set. Point it at your backend service URL " +
        "(locally http://localhost:8080).",
    );
  }
  const token = getSessionToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
}
