// The Forte session token returned by login. We keep it in sessionStorage and forward it to
// the backend *service* as a Bearer token on each call. This is the simplest cross-origin
// transport between a website and a service and makes the auth flow visible in the network
// tab. For a production-hardened, httpOnly-cookie approach that keeps the token out of JS,
// see the README section on first-party cookies via `/_forte`.

const KEY = "forte_session_token";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setSessionToken(token: string): void {
  window.sessionStorage.setItem(KEY, token);
}

export function clearSessionToken(): void {
  window.sessionStorage.removeItem(KEY);
}
