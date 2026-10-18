# Forte example: Next.js app deployed as a service

A Next.js 16 (App Router) app deployed as a single Forte service, with frontend and backend in one
codebase. It uses [`@forteplatforms/sdk`](https://www.npmjs.com/package/@forteplatforms/sdk) to:

- Sign users up and in with a password or a one-time code, from the browser.
- Read the signed-in user from the `X-Forte-User-Id` header the Forte gateway sets.
- Load the user record two ways: in a Server Component (`app/dashboard/page.tsx`) and from a JSON
  route (`app/api/me`), both with the server-side `forte.projects.getUser`.
- Update the user's `customMetadataAttributes` from an authenticated route (`app/api/me/attributes`).

To keep the frontend as a separate website, see [`../nextjs-node`](../nextjs-node) and
[`../vite-react-node`](../vite-react-node).

## How auth works

The app runs behind the Forte gateway. The gateway authenticates every request that isn't excluded,
removes any `X-Forte-*` headers the client sent, and sets `X-Forte-User-Id`. Server code reads that
header and never checks a token itself.

Page navigations can't carry an `Authorization` header, so the gateway authenticates them from a
cookie. The browser signs in with Forte directly and gets a session token. `app/api/auth/session`
stores it as an httpOnly `Forte-User-Session-Token` cookie on the app's origin, which is the cookie
name the gateway reads. Every later request sends the cookie.

Signed-out requests to an authenticated route get a 401 from the gateway and never reach the app.
That's why `/` and `/login` are excluded from authentication and the login page sends signed-in users
on to the dashboard. `proxy.ts` (Next.js 16 middleware) only matters when you run `next dev` with
nothing in front of it.

Sign-up registers the user, emails a verification code, and signs in with the password once the
email is verified. One-time-code sign-in works for existing accounts. If the project requires MFA,
the login page shows an error; see [MFA](https://forteplatforms.com/docs/core-concepts/users/mfa)
for the extra step.

## Run locally

The app needs `X-Forte-User-Id`, so locally you run `forte proxy` in front of `next dev`. The proxy
authenticates each request against Forte, applies the service's auth exclusions, and sets the same
header. Deploy the service first (see [Deploy](#deploy)) so the proxy has a service and exclusions to
work with.

```bash
bun install
cp .env.example .env.local   # set FORTE_PROJECT_ID and FORTE_API_TOKEN
bun dev                      # Next.js on http://localhost:3000
```

In a second terminal, start the proxy on `:8080`:

```bash
forte proxy --project-id <projectId> --service-id <serviceId> -p 3000
```

Open <http://localhost:8080> and sign up. Get `FORTE_PROJECT_ID` and `FORTE_API_TOKEN` from the
Forte console (Project → API tokens).

## Deploy

Deploy this folder as a service. A website would get no `FORTE_API_TOKEN`, no `X-Forte-User-Id`,
and no request logs. `FORTE_API_TOKEN` and `FORTE_PROJECT_ID` are set automatically.

The path below assumes this folder is at `nextjs-service/` in your repository.

```bash
forte services create <projectId> \
  --name my-nextjs-app \
  --repo <githubHttpsUrl> --branch main \
  --base-dir nextjs-service
```

Then set the routes that skip authentication. Exclusions are set with `update`; `create` ignores
them.

```bash
forte services update <projectId> <serviceId> \
  --auth-exclude / \
  --auth-exclude /login \
  --auth-exclude '/api/auth/**' \
  --auth-exclude /api/config \
  --auth-exclude '/_next/static/**' \
  --auth-exclude /favicon.ico
```

| Exclusion | Why |
|---|---|
| `/`, `/login` | Signed-out visitors need to reach the login page. |
| `/api/auth/**` | Saving the session cookie and logging out. |
| `/api/config` | The login page reads the project ID before anyone is signed in. |
| `/_next/static/**`, `/favicon.ico` | The login page's scripts, styles, and icon. |

Excluded routes never get `X-Forte-User-Id`, even for a signed-in user, so don't call
`getCurrentUser()` from them. `forte proxy` applies the same exclusions locally.

## Files

| File | What it shows |
|------|---------------|
| `app/login/page.tsx` | Sign-up with email verification, password sign-in, and one-time-code sign-in, from the browser. |
| `app/api/auth/session/route.ts` | Stores the session token as the httpOnly `Forte-User-Session-Token` cookie. |
| `lib/forte.ts` | The server-side `ForteClient` (reads `FORTE_API_TOKEN`) and `getCurrentUser()`, which reads `X-Forte-User-Id`. |
| `proxy.ts` | Redirects to `/login` when `X-Forte-User-Id` is missing, which only happens without the gateway in front. |
| `app/dashboard/page.tsx` | Server Component that loads the user with `projects.getUser`. |
| `app/api/me/route.ts` | The same lookup as JSON, used by `ApiRouteDemo.tsx`. |
| `app/api/me/attributes/route.ts` | Accepts only known preference keys, merges them into `customMetadataAttributes`, and calls `projects.putUserCustomAttributes`. |
| `app/api/auth/logout/route.ts` | Calls `users.logout`, clears the cookie, and redirects to `/login`. |

## Notes on the design

- **Login runs in the browser.** The SDK calls are visible in the network tab. The project ID
  comes from `/api/config`; it's public. `FORTE_API_TOKEN` stays on the server.
- **No token checks in the app.** The gateway has already authenticated the request, so the app
  reads `X-Forte-User-Id` and does nothing else.
- **Preferences are allowlisted.** The attributes route accepts `favoriteColor` and `theme` only.
  Writing arbitrary keys from the browser would let users set values your app might later trust,
  such as a plan or a role. `putUserCustomAttributes` replaces the whole map, so the route reads,
  merges, and writes back.
