import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/forte";

// Stores the session token from a browser login as an httpOnly cookie on this app's origin, under
// the name the Forte gateway reads. The gateway (or `forte proxy` locally) then authenticates each
// request from the cookie and sets X-Forte-User-Id; the app never checks the token itself.
//
// Pointing the browser SDK at the service's `/_forte` path also sets this cookie. A route of
// your own keeps local development under `forte proxy` the same as production.
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
