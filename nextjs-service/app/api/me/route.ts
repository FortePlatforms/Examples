import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/forte";

// The same server-side user lookup as the dashboard Server Component, exposed as JSON.
// `getCurrentUser` reads the id the middleware resolved from the gateway's `X-Forte-User-Id` header.
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(user);
}
