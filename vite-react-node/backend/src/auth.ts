import type { Request } from "express";
import type { UserObject } from "@forteplatforms/sdk";
import { forte, getProjectId } from "./forte.js";

const FORTE_USER_ID_HEADER = "x-forte-user-id";

/**
 * The signed-in user's id, or null on an unauthenticated request.
 *
 * The Forte gateway authenticates the request and sets `X-Forte-User-Id`. It strips any
 * client-sent `X-Forte-*` header first, so the value can be trusted. Locally, `forte proxy`
 * sets the same header.
 */
export function getUserId(req: Request): string | null {
  return req.header(FORTE_USER_ID_HEADER) ?? null;
}

/** The signed-in user's full record. Costs one Forte API call, so use getUserId when the id is enough. */
export async function getUser(req: Request): Promise<(UserObject & { userId: string }) | null> {
  const userId = getUserId(req);
  if (!userId) return null;
  const user = await forte.projects.getUser({ projectId: getProjectId(), userId });
  return { ...user, userId };
}
