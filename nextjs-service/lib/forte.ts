import "server-only";
import { ForteClient, type UserObject } from "@forteplatforms/sdk";
import { headers } from "next/headers";

// The Forte session cookie name the gateway recognizes. After a browser-direct login we store the
// returned token under this name, first-party on the service's own origin (see
// `app/api/auth/session`), so the gateway — or `forte proxy` locally — authenticates it on every
// subsequent request and injects the trusted `X-Forte-User-Id` header.
export const SESSION_COOKIE = "Forte-User-Session-Token";

// `proxy.ts` forwards the gateway's resolved user id to the server under this name.
const APP_USER_ID_HEADER = "x-app-user-id";

export function getProjectId(): string {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "FORTE_PROJECT_ID is not set. In production on Forte this is provided to your service automatically; locally, set it in .env.local.",
    );
  }
  return projectId;
}

// FORTE_API_TOKEN is read automatically from process.env by ForteClient.
export const forte = new ForteClient();

/**
 * The signed-in user, fetched from the server-side API. `proxy.ts` already resolved them from the
 * gateway's `X-Forte-User-Id` header and forwarded the id, so this trusts it without re-validating.
 * The returned `userId` is guaranteed present — it's the id the middleware forwarded.
 */
export async function getCurrentUser(): Promise<UserObject & { userId: string }> {
  const h = await headers();
  const userId = h.get(APP_USER_ID_HEADER);
  if (!userId) {
    throw new Error("No authenticated user — middleware should have redirected.");
  }
  const user = await forte.projects.getUser({ projectId: getProjectId(), userId });
  return { ...user, userId };
}
