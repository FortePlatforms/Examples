import type { Request } from "express";
import { ForteClient } from "@forteplatforms/sdk";
import { getProjectId } from "./forte.js";

const FORTE_USER_ID_HEADER = "x-forte-user-id";

/**
 * Resolve the authenticated end-user for an incoming request, or null if there isn't one.
 *
 * Production: this backend runs as a Forte *service*, so the Forte gateway authenticates every
 * request before it arrives and injects a trusted `X-Forte-User-Id` header. The gateway strips
 * any client-supplied `X-Forte-*` headers first, so trusting this value here is safe.
 *
 * Local dev: there is no Forte gateway in front of `localhost`, so we fall back to validating
 * the `Authorization: Bearer <sessionToken>` that the frontend forwards. We hand that token to
 * the user-facing API (`forte.users.getAccount`) to resolve which user it belongs to. The
 * gateway accepts the same bearer token in production, so this path also works if you call the
 * service directly without going through the website.
 */
export async function resolveUserId(req: Request): Promise<string | null> {
  const fromGateway = req.header(FORTE_USER_ID_HEADER);
  if (fromGateway) {
    return fromGateway;
  }

  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      // No API token: this is a user-facing call authenticated by the session token itself.
      const forte = new ForteClient();
      const account = await forte.users.getAccount(
        { projectId: getProjectId() },
        { headers: { Authorization: authorization } },
      );
      return account.userId ?? null;
    } catch {
      return null;
    }
  }

  return null;
}
