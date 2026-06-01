# Forte Example: Next.js website + Node service

A runnable example showing the recommended shape for a Forte app with a real backend:

- **`frontend/`** — a Next.js app deployed as a Forte **website**. Frontend only. It signs users
  in with the Forte SDK in the browser, then calls the backend for anything privileged.
- **`backend/`** — a Node/Express app deployed as a Forte **service**. It holds the server-side
  `FORTE_API_TOKEN`, reads the authenticated user the Forte gateway injects, and uses the
  server-side Forte API.

The two pieces are deployed separately and talk over HTTP.

## Why the backend isn't just inside Next.js

It's tempting to put everything in one Next.js app and deploy it as a website. Don't — a Forte
**website is frontend only**. Websites are served directly from a CDN and **do not pass through the
Forte gateway**, which means a website does **not** get the tools your backend needs:

| | Forte **website** (this `frontend/`) | Forte **service** (this `backend/`) |
|---|---|---|
| `FORTE_API_TOKEN` (server-side `forte.projects.*`) | ❌ never injected | ✅ injected automatically |
| End-user auth enforcement + `X-Forte-User-Id` header | ❌ no | ✅ gateway authenticates every request |
| Request logs, metrics, latency percentiles | ❌ no | ✅ captured automatically |
| Served from | CDN (bypasses the gateway) | behind the Forte gateway |

The most important line is the first one. `FORTE_API_TOKEN` acts as the **project owner** — it can
read and modify *any* user. A website ships its code to every visitor's browser, so a token reachable
from a website would be a public secret: anyone could act as the owner. That's why Forte never injects
it into websites, and why this example keeps every `forte.projects.*` call in the service.

**Rule of thumb:** if code needs the server-side Forte API (`forte.projects.*`), authenticated request
handling, or observability, it belongs in a **service** — not a website.

> See also: [Services](https://forteplatforms.com/docs/core-concepts/services) ·
> [Websites](https://forteplatforms.com/docs/core-concepts/websites) ·
> [API Surfaces](https://forteplatforms.com/docs/core-concepts/api-surfaces)

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
   In production the Forte gateway validates it, then forwards the request to the service with a
   trusted `X-Forte-User-Id` header (it strips any client-set `X-Forte-*` headers first).
3. **The service does the privileged work** — it reads `X-Forte-User-Id` to know who's calling and
   uses its `FORTE_API_TOKEN` to call `forte.projects.*`.

### Touchpoints

| File | What it shows |
|------|---------------|
| `frontend/app/login/page.tsx` | Browser SDK: `new ForteClient()` (no token), then `users.registerUser` / `users.passwordLogin` / `users.createOtpLogin` / `users.completeOtpLogin`. |
| `frontend/lib/session.ts` | Keeps the returned session token in `sessionStorage`. |
| `frontend/lib/api.ts` | `backendFetch()` — calls the service with the session token as a Bearer header. |
| `backend/src/auth.ts` | Resolves the user: trusts `X-Forte-User-Id` in production, falls back to validating the Bearer token locally. |
| `backend/src/index.ts` | Express service: CORS for the website origin, `GET /health`, `GET /api/me`, `PUT /api/me/attributes`. |
| `backend/src/forte.ts` | The single server-side `ForteClient` (auto-reads `FORTE_API_TOKEN`). |

> **Bearer token vs. first-party cookie.** This example sends the session token as a Bearer header —
> the simplest cross-origin transport, and it works regardless of domains. If you'd rather keep the
> token out of JavaScript and rely on an httpOnly session cookie, point the browser SDK at your
> service's reserved `/_forte` path so the cookie is set first-party. See
> [First-party cookies via `/_forte`](https://forteplatforms.com/docs/core-concepts/sdks#first-party-cookies-via-_forte).

## Run locally

There's no Forte gateway in front of `localhost`, so the backend validates the Bearer token directly
(see `backend/src/auth.ts`) — the same result the gateway gives you in production.

**1. Start the backend (service):**

```bash
cd backend
cp .env.example .env        # fill in FORTE_API_TOKEN and FORTE_PROJECT_ID
bun install                 # or: npm install
bun run dev                 # listens on http://localhost:8080
```

**2. Start the frontend (website):**

```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_FORTE_PROJECT_ID; NEXT_PUBLIC_BACKEND_URL defaults to :8080
bun install                 # or: npm install
bun run dev                 # opens http://localhost:3000
```

Open <http://localhost:3000>, sign in with either tab, and you'll land on the dashboard. Get
`FORTE_API_TOKEN` and your project ID from the Forte dashboard (Project → API tokens).

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

# Frontend → a website. FORTE_PROJECT_ID (and NEXT_PUBLIC_ variants) are injected automatically.
forte websites create <projectId> \
  --name my-app-frontend \
  --repo <githubHttpsUrl> --branch main \
  --subdirectory frontend \
  --env NEXT_PUBLIC_BACKEND_URL=https://<your-backend-service>.tryforte.dev
```

Notes:
- `--auth-exclude /health` lets Forte's health check reach the service without a logged-in user.
- Set the website's `NEXT_PUBLIC_BACKEND_URL` to the **service** URL, and the service's
  `FRONTEND_ORIGIN` to the **website** URL (used for CORS).
- See the [Monorepo guide](https://forteplatforms.com/docs/guides/monorepo) for deploying both from
  one repository.

## Alternative: one Next.js codebase, hosted as a service

If you'd rather keep your backend logic *inside* Next.js (API routes, server components, server
actions) instead of a separate Express app, you can — but deploy that Next.js app as a Forte
**service**, not a website. As a service it runs behind the gateway, so it gets exactly the tooling a
website lacks: `FORTE_API_TOKEN` is injected, every request is authenticated with `X-Forte-User-Id`,
and requests are logged and metered. Your server-side code can then call `forte.projects.*` directly,
with no separate backend.

Trade-offs:

- **Single Next.js service** — one codebase, backend logic lives next to your pages, full Forte
  tooling. Simplest if your frontend and backend evolve together. The whole app runs as server-rendered
  code behind the gateway.
- **Website + service (this example)** — a clean, enforced boundary: the frontend is static and
  literally *cannot* hold a server secret, and the backend scales and deploys independently. Best when
  you want the frontend and backend decoupled, or a CDN-served static frontend.

What you should **not** do is deploy a Next.js app that depends on `FORTE_API_TOKEN`,
`X-Forte-User-Id`, or request logging as a **website** — a website gets none of those. Pick "service"
(with or without a separate frontend), and reach for a "website" only for frontend-only hosting.
