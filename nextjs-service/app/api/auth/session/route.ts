import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/forte";

// After a browser-direct login, the SDK returns a session token. This route stores it as a
// first-party, httpOnly cookie on the service's own origin, under the name the Forte gateway
// recognizes. On every subsequent request the gateway (production) or `forte proxy` (local) reads
// that cookie, authenticates the user, and injects the trusted `X-Forte-User-Id` header that
// `proxy.ts` reads — so the app itself never validates the token.
//
// This is the server-side equivalent of pointing the browser SDK at the reserved `/_forte` path;
// doing it here keeps the flow identical in local development and production.
export async function POST(req: NextRequest) {
  const { sessionToken, expirationTime } = (await req.json()) as {
    sessionToken?: string;
    expirationTime?: string;
  };

  if (!sessionToken) {
    return NextResponse.json({ error: "sessionToken required" }, { status: 400 });
  }

  const expires = expirationTime ? new Date(expirationTime) : undefined;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}
