import { NextResponse } from "next/server";

// Exposes only the (non-secret) project ID to the browser, so the login page
// can construct SDK requests without baking it into a NEXT_PUBLIC_* var at
// build time. The API token never leaves the server.
export async function GET() {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "FORTE_PROJECT_ID not set" }, { status: 500 });
  }
  return NextResponse.json({ projectId });
}
