import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ForteClient } from "@forteplatforms/sdk";
import { getProjectId } from "@/lib/forte";

export async function POST() {
  const jar = await cookies();
  const sessionToken = jar.get("forte_session")?.value;

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
  res.cookies.set("forte_session", "", { path: "/", maxAge: 0 });
  return res;
}
