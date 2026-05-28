import { NextRequest, NextResponse } from "next/server";
import { ForteClient } from "@forteplatforms/sdk";

const SESSION_COOKIE = "forte_session";
const FORTE_USER_ID_HEADER = "x-forte-user-id";
const APP_USER_ID_HEADER = "x-app-user-id";

export async function proxy(req: NextRequest) {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    return new NextResponse("FORTE_PROJECT_ID not set", { status: 500 });
  }

  // Production path: the Forte gateway proxies authenticated traffic to your
  // service with X-Forte-User-Id pre-populated. The gateway strips any
  // client-set X-Forte-* headers before adding the trusted value, so reading
  // it here is safe.
  let userId = req.headers.get(FORTE_USER_ID_HEADER);

  // Local-dev fallback: validate the same-origin session cookie that the
  // login page persisted via /api/auth/local-bridge.
  if (!userId) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    if (sessionToken) {
      try {
        const forte = new ForteClient();
        const user = await forte.users.getAccount(
          { projectId },
          { headers: { Authorization: `Bearer ${sessionToken}` } },
        );
        userId = user.userId ?? null;
      } catch {
        userId = null;
      }
    }
  }

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
