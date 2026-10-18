// The Forte session token returned by login, kept in sessionStorage and sent to the backend
// service as a Bearer header. It works across origins and shows up plainly in the network tab.
// To keep the token out of JavaScript, use an httpOnly cookie instead (see the README).

const KEY = "forte_session_token";

export function getSessionToken(): string | null {
  return window.sessionStorage.getItem(KEY);
}

export function setSessionToken(token: string): void {
  window.sessionStorage.setItem(KEY, token);
}

export function clearSessionToken(): void {
  window.sessionStorage.removeItem(KEY);
}
