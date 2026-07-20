import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ForteClient } from "@forteplatforms/sdk";
import { getProjectId, SESSION_COOKIE } from "@/lib/forte";

export async function POST() {
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    try {
      const forte = new ForteClient();
      await forte.users.logout({
        projectId: getProjectId(),
        authorization: `Bearer ${sessionToken}`,
      });
    } catch {
      // Best-effort: even if the upstream call fails (e.g., the token is
      // already invalid) we still want to clear the local cookie.
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
