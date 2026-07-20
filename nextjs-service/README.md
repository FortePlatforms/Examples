# Forte Next.js Example (single app, deployed as a service)

A runnable Next.js 16 (App Router) example that runs as a **single Forte service** — frontend and
backend in one codebase — using [`@forteplatforms/sdk`](https://www.npmjs.com/package/@forteplatforms/sdk) to:

- Sign users in with either a **password** or a **one-time code** — both calling the SDK directly from the browser.
- Gate authenticated routes with a Next.js **`proxy.ts`** (Next.js 16's middleware) that reads the trusted `X-Forte-User-Id` header the Forte gateway — or `forte proxy` locally — injects on each authenticated request.
- Look up the current user **two ways** from the server: a Server Component (`app/dashboard/page.tsx`) and a JSON API route (`app/api/me`), both via the server-side `forte.projects.getUser`.
- Read and update `customMetadataAttributes` on the signed-in user through an authenticated mutation route (`app/api/me/attributes`).

> This is the "one Next.js codebase, hosted as a service" shape. If you'd rather keep a static,
> CDN-served frontend separate from your backend, see the sibling [`../nextjs-node`](../nextjs-node)
> and [`../vite-react-node`](../vite-react-node) examples (website + service split).

## How auth works

Because this whole app is a **service**, it sits behind the Forte gateway, which authenticates every
request and injects a trusted `X-Forte-User-Id` header (stripping any client-set `X-Forte-*` first).
`proxy.ts` reads that header and nothing else — it never validates a token itself, and every server
lookup uses the server-side `forte.projects.getUser({ projectId, userId })`.

The one wrinkle for a single-origin app: page navigations (Server Components) can't carry a Bearer
header, so the gateway authenticates them from a **cookie**. Login happens browser-direct to Forte and
returns a session token; `app/api/auth/session` then stores it as a first-party, httpOnly
`Forte-User-Session-Token` cookie on the service's own origin — the name the gateway recognizes. Every
following request carries it, the gateway authenticates it and injects `X-Forte-User-Id`, and
`proxy.ts` reads that. (This is the server-side equivalent of the SDK's reserved `/_forte` path, done
by hand so the flow is identical locally and in production.)

## Run locally

The app only works behind the gateway — nothing else sets `X-Forte-User-Id` — so locally you run
**`forte proxy`** in front of `next dev`. The proxy authenticates each request against Forte and
forwards it with the `X-Forte-User-Id` header, exactly like production. Create the service first (see
**Deploy to Forte**): that both gives the proxy a service to authenticate against and configures the
auth exclusions it applies locally.

```bash
bun install
cp .env.example .env.local   # fill in FORTE_PROJECT_ID and FORTE_API_TOKEN
bun dev                      # Next.js dev server on http://localhost:3000

# in a second terminal — the gateway stand-in, listening on http://localhost:8080
forte proxy --project-id <projectId> --service-id <serviceId> -p 3000
```

Open <http://localhost:8080/login>, sign up with either tab, and you'll land on the dashboard. Get
`FORTE_PROJECT_ID` and `FORTE_API_TOKEN` from the Forte dashboard (Project → API tokens).

> Browse straight to `/login` — a gated route like `/dashboard` returns 401 while you're signed out,
> because the gateway rejects it before it reaches the app. That's normal Forte service behavior.

## Deploy to Forte

Deploy this directory as a **service** (not a website — a website gets no `FORTE_API_TOKEN`, no
`X-Forte-User-Id`, and no request logs). `FORTE_API_TOKEN` and `FORTE_PROJECT_ID` are injected
automatically.

```bash
forte services create <projectId> \
  --name my-nextjs-app \
  --repo <githubHttpsUrl> --branch main \
  --base-directory examples/nextjs-service \
  --auth-exclude /login \
  --auth-exclude '/api/auth/**' \
  --auth-exclude /api/config
```

The `--auth-exclude` paths let the login page, the session/logout routes, and the public config route
be reached without a signed-in user. Every other route requires auth, so the gateway injects
`X-Forte-User-Id` — which is what `proxy.ts` reads. These same exclusions are what `forte proxy`
applies during local development.

## How Forte is wired in

A short tour of the touchpoints:

| File | What it shows |
|------|---------------|
| `app/login/page.tsx` | The SDK in the browser. `new ForteClient()` (no token), then `users.registerUser` / `users.passwordLogin` / `users.createOtpLogin` / `users.completeOtpLogin`. |
| `app/api/auth/session/route.ts` | Stores the login session token as a first-party, httpOnly `Forte-User-Session-Token` cookie so the gateway (and `forte proxy` locally) authenticates subsequent requests. |
| `proxy.ts` | The auth gate (Next.js 16 middleware). Reads the `X-Forte-User-Id` header the gateway injects and forwards the resolved user ID to handlers via `x-app-user-id`. |
| `lib/forte.ts` | A single server-side `ForteClient` (it auto-reads `FORTE_API_TOKEN` from the environment), plus a `getCurrentUser()` helper for Server Components. |
| `app/dashboard/page.tsx` | Server Component. Calls `projects.getUser` with the auto-provisioned API token to render the user record. |
| `app/api/me/route.ts` | Same lookup, exposed as JSON. Used by `ApiRouteDemo.tsx` to demonstrate the client-fetched pattern. |
| `app/api/me/attributes/route.ts` | Authenticated mutation: merges a patch into existing `customMetadataAttributes` and calls `projects.putUserCustomAttributes`. |
| `app/api/auth/logout/route.ts` | Calls `users.logout` against Forte and clears the session cookie. |

## Why this shape?

- **Browser-direct SDK calls for login.** The clearest demonstration of the SDK is the one that's visible in the network tab. Anything sensitive (the API token, the project ID) stays on the server.
- **Middleware-based auth.** Forte authenticates every request at the gateway, so the middleware just trusts the `X-Forte-User-Id` header it receives — re-validating a token on every request would only add latency. Locally, `forte proxy` reproduces that gateway behavior.
- **Two backend lookup styles.** Server Components are the default in Next.js 16 and give you per-request data with no client-side fetching. API routes are still useful when you need to refresh data without a navigation. The example shows both so you can pick the one that fits your screen.
