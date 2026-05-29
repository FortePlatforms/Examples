# Forte Next.js Example

A runnable Next.js 16 (App Router) example that uses [`@forteplatforms/sdk`](https://www.npmjs.com/package/@forteplatforms/sdk) to:

- Sign users in with either a **password** or a **one-time code** — both calling the SDK directly from the browser.
- Gate authenticated routes with a Next.js **`proxy.ts`** that trusts the `X-Forte-User-Id` header set by the Forte gateway in production, and falls back to validating a same-origin session cookie for local development.
- Look up the current user **two ways** from the backend: a Server Component (`app/dashboard/page.tsx`) and a JSON API route (`app/api/me`).
- Read and update `customMetadataAttributes` on the signed-in user through an authenticated mutation route (`app/api/me/attributes`).

## Run locally

```bash
bun install
cp .env.example .env.local   # fill in FORTE_PROJECT_ID and FORTE_API_TOKEN
bun dev
```

Open <http://localhost:3000>, sign up with either tab, and you'll land on the dashboard.

Get `FORTE_PROJECT_ID` and `FORTE_API_TOKEN` from the Forte dashboard (Project → API tokens). If any client component reads the project ID, also set `NEXT_PUBLIC_FORTE_PROJECT_ID` in `.env.local` so Next.js inlines it into the browser bundle — in production Forte sets it for you.

## Deploy to Forte

Point Forte at this directory. `FORTE_PROJECT_ID` and `FORTE_WEB_APP_ID` are provided to your website automatically — both as the canonical names *and* as `NEXT_PUBLIC_FORTE_PROJECT_ID` / `NEXT_PUBLIC_FORTE_WEB_APP_ID` so they reach Next.js client components without extra config. `FORTE_API_TOKEN` is **not** auto-injected for websites to prevent unintended security vulnerabilities; set it as a Secret on the website's edit page if your server-side code needs it.

Once deployed, the Forte gateway authenticates incoming requests and forwards them to this app with `X-Forte-User-Id` set, which is what `proxy.ts` reads.

## How Forte is wired in

A short tour of the touchpoints:

| File | What it shows |
|------|---------------|
| `app/login/page.tsx` | The SDK in the browser. `new ForteClient()` (no token), then `users.registerUser` / `users.passwordLogin` / `users.createOtpLogin` / `users.completeOtpLogin`. |
| `app/api/auth/local-bridge/route.ts` | Persists the returned session token to a same-origin `forte_session` cookie so the middleware's local-dev fallback can authenticate the user. Not needed in production. |
| `proxy.ts` | The auth gate. Reads `X-Forte-User-Id` (production) or validates the session cookie via `users.getAccount` (local). Forwards the resolved user ID to handlers via `x-app-user-id`. |
| `lib/forte.ts` | A single server-side `ForteClient` (it auto-reads `FORTE_API_TOKEN` from the environment), plus a `getCurrentUser()` helper for Server Components. |
| `app/dashboard/page.tsx` | Server Component. Calls `projects.getUser` with the auto-provisioned API token to render the user record. |
| `app/api/me/route.ts` | Same lookup, exposed as JSON. Used by `ApiRouteDemo.tsx` to demonstrate the client-fetched pattern. |
| `app/api/me/attributes/route.ts` | Authenticated mutation: merges a patch into existing `customMetadataAttributes` and calls `projects.putUserCustomAttributes`. |
| `app/api/auth/logout/route.ts` | Calls `users.logout` against Forte and clears the local cookie. |

## Why this shape?

- **Browser-direct SDK calls for login.** The clearest demonstration of the SDK is the one that's visible in the network tab. Anything sensitive (the API token, the project ID) stays on the server.
- **Middleware-based auth.** In production, Forte already authenticated the user at the edge — the middleware just trusts the header it received. Re-validating session tokens on every request would only slow the app down. The local-dev fallback exists so you can develop without proxying through Forte.
- **Two backend lookup styles.** Server Components are the default in Next.js 16 and give you per-request data with no client-side fetching. API routes are still useful when you need to refresh data without a navigation. The example shows both so you can pick the one that fits your screen.
