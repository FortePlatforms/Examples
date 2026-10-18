import { NextResponse } from "next/server";

// Gives the login page the project ID, which Forte sets on the service at runtime. A project ID
// is public; it names the project and authorizes nothing. The API token stays on the server.
export async function GET() {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json({ error: "FORTE_PROJECT_ID not set" }, { status: 500 });
  }
  return NextResponse.json({ projectId });
}
