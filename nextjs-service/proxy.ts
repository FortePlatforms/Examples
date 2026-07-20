import { NextRequest, NextResponse } from "next/server";

const FORTE_USER_ID_HEADER = "x-forte-user-id";
const APP_USER_ID_HEADER = "x-app-user-id";

// The auth gate. This app is deployed as a Forte *service*, so the Forte gateway authenticates
// every request and injects a trusted `X-Forte-User-Id` header before it arrives (it strips any
// client-set `X-Forte-*` headers first, so trusting this value is safe). Locally, `forte proxy`
// reproduces the gateway and injects the same header. This middleware only reads it, then
// forwards the resolved user id to route handlers and Server Components as `x-app-user-id`.
//
// A request without the header should never reach a gated route through the gateway/proxy — it
// would have been rejected upstream — so this redirect is a fallback for the un-proxied case
// (e.g. running `next dev` directly with nothing in front).
export function proxy(req: NextRequest) {
  const userId = req.headers.get(FORTE_USER_ID_HEADER);

  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const forwarded = new Headers(req.headers);
  forwarded.set(APP_USER_ID_HEADER, userId);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: [
    // Match everything except: /login, /api/auth/*, /api/config, _next assets, favicon.
    "/((?!login|api/auth|api/config|_next/static|_next/image|favicon.ico).*)",
  ],
};
