import "server-only";
import { ForteClient, type UserObject } from "@forteplatforms/sdk";
import { headers } from "next/headers";

// The session cookie name the Forte gateway reads. After login, app/api/auth/session stores the
// token under this name on the app's own origin, so the gateway authenticates every later request.
export const SESSION_COOKIE = "Forte-User-Session-Token";

// Set by the Forte gateway (or `forte proxy` locally) on authenticated requests. The gateway
// removes any X-Forte-* header the client sent, so the value can be trusted.
const FORTE_USER_ID_HEADER = "x-forte-user-id";

export function getProjectId(): string {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "FORTE_PROJECT_ID is not set. Forte sets it on services; locally, set it in .env.local.",
    );
  }
  return projectId;
}

// Reads FORTE_API_TOKEN from the environment.
export const forte = new ForteClient();

/** The signed-in user's full record, loaded with the server-side API. */
export async function getCurrentUser(): Promise<UserObject & { userId: string }> {
  const userId = (await headers()).get(FORTE_USER_ID_HEADER);
  if (!userId) {
    throw new Error("No X-Forte-User-Id header. Is this route excluded from authentication?");
  }
  const user = await forte.projects.getUser({ projectId: getProjectId(), userId });
  return { ...user, userId };
}
