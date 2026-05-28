import { NextResponse } from "next/server";
import { forte, getProjectId } from "@/lib/forte";
import { getAuthenticatedUserId } from "@/lib/identity";

// Middleware has already resolved the user (from X-Forte-User-Id in
// production, or by validating the session cookie locally). It exposed the
// resolved userId via x-app-user-id, so this route trusts it without
// re-validating.
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const user = await forte.projects.getUser({ projectId: getProjectId(), userId });
  return NextResponse.json(user);
}
