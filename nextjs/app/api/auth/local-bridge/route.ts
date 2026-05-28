import { NextRequest, NextResponse } from "next/server";

// The login page calls Forte directly from the browser and receives a session
// token in the response. In production behind the Forte gateway, Forte also
// sets a cookie scoped to the parent domain — so on subsequent requests, the
// gateway sees it and injects X-Forte-User-Id automatically. For local dev
// (where localhost can't share cookies with api.forteplatforms.com), this
// endpoint persists the token to a same-origin cookie so the middleware's
// fallback path can authenticate the user.
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
  res.cookies.set("forte_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}
