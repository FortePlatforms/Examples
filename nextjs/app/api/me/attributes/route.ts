import { NextRequest, NextResponse } from "next/server";
import { forte, getProjectId } from "@/lib/forte";
import { getAuthenticatedUserId } from "@/lib/identity";

// Forte's custom-attributes endpoint accepts string values only. Merging
// against the existing map preserves attributes the client didn't send.
export async function PUT(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const patch = (await req.json()) as Record<string, string | number | null | undefined>;
  const projectId = getProjectId();

  const current = await forte.projects.getUser({ projectId, userId });
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(current.customMetadataAttributes ?? {})) {
    if (v !== null && v !== undefined) merged[k] = String(v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete merged[k];
    } else if (v !== undefined) {
      merged[k] = String(v);
    }
  }

  const updated = await forte.projects.putUserCustomAttributes({
    projectId,
    userId,
    requestBody: merged,
  });
  return NextResponse.json(updated);
}
