# Forte Example: React SPA website + Node service

A runnable example showing the recommended shape for a Forte app whose frontend is a **single-page
application**:

- **`frontend/`** — a React single-page app (built with [Vite](https://vite.dev)) deployed as a
  Forte **website**. Frontend only. It signs users in with the Forte SDK in the browser, then calls
  the backend for anything privileged.
- **`backend/`** — a Node/Express app deployed as a Forte **service**. It holds the server-side
  `FORTE_API_TOKEN`, reads the authenticated user the Forte gateway injects, and uses the
  server-side Forte API.

The two pieces are deployed separately and talk over HTTP.

> Prefer a full-stack framework? See the sibling [`../nextjs-node`](../nextjs-node) example, which
> uses Next.js for the frontend. The website/service split is identical; only the frontend tooling
> differs.

## Why the backend isn't just part of the SPA

A single-page app is **pure frontend**: `vite build` produces a static `dist/` directory of HTML,
CSS, and JS with **no server runtime at all**. That's exactly why it's deployed as a Forte
**website** — and exactly why it can't do the privileged work. Websites are served directly from a
CDN and **do not pass through the Forte gateway**, so a website does **not** get the tools your
backend needs:

| | Forte **website** (this `frontend/`) | Forte **service** (this `backend/`) |
|---|---|---|
| `FORTE_API_TOKEN` (server-side `forte.projects.*`) | ❌ never injected | ✅ injected automatically |
| End-user auth enforcement + `X-Forte-User-Id` header | ❌ no | ✅ gateway authenticates every request |
| Request logs, metrics, latency percentiles | ❌ no | ✅ captured automatically |
| Served from | CDN (bypasses the gateway) | behind the Forte gateway |

The most important line is the first one. `FORTE_API_TOKEN` acts as the **project owner** — it can
read and modify *any* user. An SPA ships its entire JavaScript bundle to every visitor's browser, so
a token reachable from it would be a public secret: anyone could act as the owner. There is no
server in an SPA to keep a secret on. That's why Forte never injects it into websites, and why this
example keeps every `forte.projects.*` call in the service.

**Rule of thumb:** if code needs the server-side Forte API (`forte.projects.*`), authenticated
request handling, or observability, it belongs in a **service** — not a website.

> See also: [Services](https://forteplatforms.com/docs/core-concepts/services) ·
> [Websites](https://forteplatforms.com/docs/core-concepts/websites) ·
> [API Surfaces](https://forteplatforms.com/docs/core-concepts/api-surfaces)

## Client-side routing just works

This is a single-page app with client-side routes (`/login`, `/dashboard`) handled by react-router.
When a visitor opens a deep link like `/dashboard` directly — or refreshes the page — Forte's
website hosting serves `index.html` for that path, and react-router takes over from there. You do
**not** need a `_redirects` file, a `404.html`, or any extra configuration; Forte applies the
single-page-app fallback to every static website automatically.

## How the two talk

```
 Browser (loaded from the website)
   │  1. forte.users.passwordLogin / OTP   ───────────────►  Forte user API
   │     returns a session token                            (forte.users.*, no API token)
   │
   │  2. fetch(BACKEND_URL/api/me,
   │        Authorization: Bearer <sessionToken>)  ───────►  Forte gateway
   │                                                            │ authenticates the session token
   │                                                            │ injects X-Forte-User-Id
   │                                                            ▼
   │                                                         Backend service
   │                                                            │ forte.projects.getUser(...)
   │  3. JSON user record  ◄────────────────────────────────────┘   (uses FORTE_API_TOKEN)
```

1. **Login happens in the browser** with the end-user API (`forte.users.*`). No API token is
   involved; the user authenticates themselves. Login returns a **session token**.
2. **The browser calls the backend service** with that token in an `Authorization: Bearer` header.
   The Forte gateway validates it, then forwards the request to the service with a trusted
   `X-Forte-User-Id` header (it strips any client-set `X-Forte-*` headers first). Locally,
   `forte proxy` stands in for the gateway and does exactly the same thing.
3. **The service does the privileged work** — it reads `X-Forte-User-Id` to know who's calling and
   uses its `FORTE_API_TOKEN` to call `forte.projects.*`.

### Touchpoints

| File | What it shows |
|------|---------------|
| `frontend/src/pages/LoginPage.tsx` | Browser SDK: `new ForteClient()` (no token), then `users.registerUser` / `users.passwordLogin` / `users.createOtpLogin` / `users.completeOtpLogin`. |
| `frontend/src/lib/session.ts` | Keeps the returned session token in `sessionStorage`. |
| `frontend/src/lib/api.ts` | `backendFetch()` — calls the service with the session token as a Bearer header. |
| `frontend/src/App.tsx` | Client-side routes for the single-page app. |
| `backend/src/auth.ts` | Resolves the user from the trusted `X-Forte-User-Id` header the gateway injects. Run `forte proxy` locally to get the same header. |
| `backend/src/index.ts` | Express service: CORS for the website origin, `GET /health`, `GET /api/me`, `PUT /api/me/attributes`. |
| `backend/src/forte.ts` | The single server-side `ForteClient` (auto-reads `FORTE_API_TOKEN`). |

> **Bearer token vs. first-party cookie.** This example sends the session token as a Bearer header —
> the simplest cross-origin transport, and it works regardless of domains. If you'd rather keep the
> token out of JavaScript and rely on an httpOnly session cookie, point the browser SDK at your
> service's reserved `/_forte` path so the cookie is set first-party. See
> [First-party cookies via `/_forte`](https://forteplatforms.com/docs/core-concepts/sdks#first-party-cookies-via-_forte).

## Run locally

The backend trusts the `X-Forte-User-Id` header the Forte gateway injects — it does no token
validation of its own. Locally there's no gateway, so you run **`forte proxy`** in front of the
backend: it authenticates each request against Forte and forwards it with the same
`X-Forte-User-Id` header, exactly like production. The proxy listens on `:8080` (the port the
frontend already targets) and forwards to the backend on `:8081`.

You need a Forte project and service first (see **Deploy to Forte** below) so the proxy has
something to authenticate against.

**1. Start the backend (service):**

```bash
cd backend
cp .env.example .env        # fill in FORTE_API_TOKEN and FORTE_PROJECT_ID
npm install
npm run dev                 # listens on http://localhost:8081
```

**2. Start `forte proxy` in front of the backend:**

```bash
forte proxy --project-id <projectId> --service-id <serviceId> -p 8081
                            # authenticates each request, forwards to the backend on :8081,
                            # and listens on http://localhost:8080
```

**3. Start the frontend (website):**

```bash
cd frontend
cp .env.example .env.local  # set FORTE_PROJECT_ID; VITE_BACKEND_URL defaults to :8080 (the proxy)
npm install
npm run dev                 # opens http://localhost:5173
```

Open <http://localhost:5173>, sign in with either tab, and you'll land on the dashboard. The browser
talks to the proxy on `:8080`, which authenticates and forwards to the backend on `:8081`. Get
`FORTE_API_TOKEN` and your project ID from the Forte dashboard (Project → API tokens).

> Vite only exposes *prefixed* variables to the browser bundle — by default just `VITE_`. This app
> adds `FORTE_` to `envPrefix` in `vite.config.ts` so it can read `FORTE_PROJECT_ID`, the canonical
> name Forte injects, rather than a Vite-specific alias. Your own values still use `VITE_`
> (`VITE_BACKEND_URL`).

## Deploy to Forte

Deploy each directory as its own resource:

```bash
# Backend → a service. FORTE_API_TOKEN and FORTE_PROJECT_ID are injected automatically.
forte services create <projectId> \
  --name my-app-backend \
  --repo <githubHttpsUrl> --branch main \
  --base-directory backend \
  --auth-exclude /health \
  --env FRONTEND_ORIGIN=https://<your-website>.sites.tryforte.dev

# Frontend → a website. Vite builds to dist/ (Forte detects this) and FORTE_PROJECT_ID is injected
# automatically; vite.config.ts exposes it to the browser bundle via envPrefix.
forte websites create <projectId> \
  --name my-app-frontend \
  --repo <githubHttpsUrl> --branch main \
  --subdirectory frontend \
  --env VITE_BACKEND_URL=https://<your-backend-service>.tryforte.dev
```

Notes:
- `--auth-exclude /health` lets Forte's health check reach the service without a logged-in user.
- Set the website's `VITE_BACKEND_URL` to the **service** URL, and the service's `FRONTEND_ORIGIN`
  to the **website** URL (used for CORS).
- `VITE_BACKEND_URL` is baked into the bundle at build time (that's how Vite handles `VITE_`
  variables), so changing it later requires a rebuild of the website.
- See the [Monorepo guide](https://forteplatforms.com/docs/guides/monorepo) for deploying both from
  one repository.

## When to reach for something else

- **This pattern (SPA website + service)** — a clean, enforced boundary: the frontend is static and
  literally *cannot* hold a server secret, it's served fast from a CDN, and the backend scales and
  deploys independently. Best when you want a CDN-served static frontend with a decoupled backend.
- **A server-rendered framework as a *service*** — if you need server-rendered pages, server
  components, or backend logic colocated with your frontend, deploy that framework (e.g. Next.js) as
  a Forte **service** instead of a website. As a service it runs behind the gateway, so it gets
  `FORTE_API_TOKEN`, authenticated requests, and observability — see the
  [`../nextjs-node`](../nextjs-node) example.

What you should **not** do is deploy a frontend that depends on `FORTE_API_TOKEN`, `X-Forte-User-Id`,
or request logging as a **website** — a website gets none of those.
