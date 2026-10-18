import { NextRequest, NextResponse } from "next/server";
import { forte, getProjectId, getCurrentUser } from "@/lib/forte";

// Preferences the user may edit. The body comes from the browser, so only these keys are
// accepted. Never let this route write a key your app uses for access decisions, such as a plan
// or a role: the user could grant it to themselves.
const PREFERENCE_RULES: Record<string, (value: string) => boolean> = {
  favoriteColor: (value) => value.length <= 32,
  theme: (value) => ["light", "dark", "system"].includes(value),
};

// Merges a patch into the user's customMetadataAttributes; a null value deletes the key.
// putUserCustomAttributes replaces the whole map, so this reads, merges, and writes back. Two
// writes at the same moment can lose one of them, which is fine for preferences but not for
// counters or other contended values.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  const patch = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    const isValid = PREFERENCE_RULES[key];
    if (!isValid || (value !== null && (typeof value !== "string" || !isValid(value)))) {
      return NextResponse.json({ error: `invalid preference: ${key}` }, { status: 400 });
    }
  }

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(user.customMetadataAttributes ?? {})) {
    if (value !== null && value !== undefined) merged[key] = String(value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value as string;
  }

  const updated = await forte.projects.putUserCustomAttributes({
    projectId: getProjectId(),
    userId: user.userId,
    requestBody: merged,
  });
  return NextResponse.json(updated);
}
