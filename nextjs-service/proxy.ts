import { NextRequest, NextResponse } from "next/server";

// Behind the Forte gateway, an unauthenticated request to a gated route is rejected before it
// gets here. This covers running `next dev` with nothing in front of it.
export function proxy(req: NextRequest) {
  if (req.headers.get("x-forte-user-id")) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except the routes excluded from authentication (see the README). `.+` leaves
    // out "/" itself.
    "/((?!login|api/auth|api/config|_next/static|favicon.ico).+)",
  ],
};
