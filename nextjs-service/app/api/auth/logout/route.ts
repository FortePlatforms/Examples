import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { forte, getProjectId, SESSION_COOKIE } from "@/lib/forte";

// Posted by the dashboard's logout form. Ends the session at Forte, clears the cookie, and sends
// the browser back to /login.
export async function POST() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    try {
      // An end-user call: the per-call `authorization` takes the place of the API token.
      await forte.users.logout({
        projectId: getProjectId(),
        authorization: `Bearer ${sessionToken}`,
      });
    } catch {
      // Already expired or invalid; the cookie is cleared either way.
    }
  }

  // A relative Location, so the redirect stays on whatever host the browser used.
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
