import "server-only";
import { ForteClient, type UserObject } from "@forteplatforms/sdk";
import { headers } from "next/headers";

export const SESSION_COOKIE = "forte_session";
export const FORTE_USER_ID_HEADER = "x-forte-user-id";
export const APP_USER_ID_HEADER = "x-app-user-id";

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

export async function getCurrentUser(): Promise<UserObject> {
  const h = await headers();
  const userId = h.get(APP_USER_ID_HEADER);
  if (!userId) {
    throw new Error("No authenticated user — middleware should have redirected.");
  }
  return forte.projects.getUser({ projectId: getProjectId(), userId });
}
