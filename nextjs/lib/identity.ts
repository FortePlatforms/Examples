import "server-only";
import { headers } from "next/headers";
import { APP_USER_ID_HEADER } from "./forte";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const h = await headers();
  return h.get(APP_USER_ID_HEADER);
}
