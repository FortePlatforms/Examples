import { NextRequest, NextResponse } from "next/server";
import { forte, getProjectId, getCurrentUser } from "@/lib/forte";

// Forte's custom-attributes endpoint accepts string values only. Merging against the user's
// existing attributes preserves keys the client didn't send.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  const patch = (await req.json()) as Record<string, string | number | null | undefined>;

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(user.customMetadataAttributes ?? {})) {
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
    projectId: getProjectId(),
    userId: user.userId,
    requestBody: merged,
  });
  return NextResponse.json(updated);
}
