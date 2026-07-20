import type { Request } from "express";
import type { UserObject } from "@forteplatforms/sdk";
import { forte, getProjectId } from "./forte.js";

const FORTE_USER_ID_HEADER = "x-forte-user-id";

/**
 * Resolve the authenticated end-user for an incoming request, or null if there isn't one.
 *
 * This backend runs as a Forte *service*: the gateway authenticates every request and injects a
 * trusted `X-Forte-User-Id` header before it arrives (client-set `X-Forte-*` headers are stripped
 * first, so trusting this value is safe). Locally, run `forte proxy` in front of this server — it
 * reproduces the gateway and injects the same header.
 *
 * We turn that id into the full user record with the server-side API, so handlers work with the
 * user object directly. The returned `userId` is guaranteed present — it's the header we looked up.
 */
export async function resolveUser(
  req: Request,
): Promise<(UserObject & { userId: string }) | null> {
  const userId = req.header(FORTE_USER_ID_HEADER);
  if (!userId) return null;
  const user = await forte.projects.getUser({ projectId: getProjectId(), userId });
  return { ...user, userId };
}
