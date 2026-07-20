# Forte Example: Next.js website + Node service

A runnable example showing the recommended shape for a Forte app with a real backend:

- **`frontend/`** — a Next.js app deployed as a Forte **website**. Frontend only. It signs users
  in with the Forte SDK in the browser, then calls the backend for anything privileged.
- **`backend/`** — a Node/Express app deployed as a Forte **service**. It holds the server-side
  `FORTE_API_TOKEN`, reads the authenticated user the Forte gateway injects, uses the
  server-side Forte API, and stores per-user data in a Forte **managed Postgres** database.

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
   The Forte gateway validates it, then forwards the request to the service with a trusted
   `X-Forte-User-Id` header (it strips any client-set `X-Forte-*` headers first). Locally,
   `forte proxy` stands in for the gateway and does exactly the same thing.
3. **The service does the privileged work** — it reads `X-Forte-User-Id` to know who's calling and
   uses its `FORTE_API_TOKEN` to call `forte.projects.*`.

### Touchpoints

| File | What it shows |
|------|---------------|
| `frontend/app/login/page.tsx` | Browser SDK: `new ForteClient()` (no token), then `users.registerUser` / `users.passwordLogin` / `users.createOtpLogin` / `users.completeOtpLogin`. |
| `frontend/lib/session.ts` | Keeps the returned session token in `sessionStorage`. |
| `frontend/lib/api.ts` | `backendFetch()` — calls the service with the session token as a Bearer header. |
| `backend/src/auth.ts` | Resolves the user from the trusted `X-Forte-User-Id` header the gateway injects. Run `forte proxy` locally to get the same header. |
| `backend/src/index.ts` | Express service: CORS for the website origin, `GET /health`, `GET /api/me`, `PUT /api/me/attributes`, and `/api/notes` CRUD. |
| `backend/src/forte.ts` | The single server-side `ForteClient` (auto-reads `FORTE_API_TOKEN`). |
| `backend/src/db.ts` | The Postgres pool: reads `DATABASE_URL`, handles idle-client errors, creates the schema on boot. |
| `frontend/app/dashboard/NotesPanel.tsx` | The CRUD UI. Note that it never sends a user id — the service derives it. |

## Why Postgres and not user metadata

The dashboard shows both, deliberately, because the line between them is the thing worth learning.

**Preferences** are stored in the user's `customMetadataAttributes` — a flat map of strings hanging
off one Forte user record. Perfect for a handful of settings: a theme, a favorite color, a counter.
No schema, no extra infrastructure, and it travels with the user.

**Notes** are rows. There are many per user, you list them in an order, you edit and delete them
individually, and one day you'll want to search them. That is a database, and trying to model it as
a metadata map means encoding a list into a string and re-parsing it on every read.

The rough test: if you'd ever want to write `WHERE`, `ORDER BY`, or `COUNT`, you want Postgres.

### One rule the service follows everywhere

Every SQL statement in `backend/src/index.ts` filters on `user_id` — **writes included**, not just
reads:

```sql
UPDATE notes SET body = $1 WHERE id = $2 AND user_id = $3
```

The `AND user_id = $3` is the part that matters. The Forte user id from the gateway is the tenant
key, so a note id on its own is never enough to address a row. If the update matched on `id` alone,
any signed-in user could edit anyone else's note by guessing a number. Written this way, someone
else's note simply matches no rows and comes back as a 404 — it is never loaded and never compared,
so there is no check to forget.

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

**1. Start Postgres:**

```bash
docker run -d --name forte-example-pg \
  -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
```

Any Postgres will do — this is just the shortest path to one. The service creates its table on
startup, so there's no migration step.

**2. Start the backend (service):**

```bash
cd backend
cp .env.example .env        # fill in FORTE_API_TOKEN and FORTE_PROJECT_ID
bun install                 # or: npm install
bun run dev                 # listens on http://localhost:8081
```

`.env.example` already points `DATABASE_URL` at the container above and sets `PORT=8081`. The backend
loads `.env` with Node's built-in `process.loadEnvFile()` (see `backend/src/env.ts`) — no dotenv
dependency.

**3. Start `forte proxy` in front of the backend:**

```bash
forte proxy --project-id <projectId> --service-id <serviceId> -p 8081
                            # authenticates each request, forwards to the backend on :8081,
                            # and listens on http://localhost:8080
```

**4. Start the frontend (website):**

```bash
cd frontend
cp .env.example .env.local  # set FORTE_PROJECT_ID; NEXT_PUBLIC_BACKEND_URL defaults to :8080 (the proxy)
bun install                 # or: npm install
bun run dev                 # opens http://localhost:3000
```

Open <http://localhost:3000>, sign in with either tab, and you'll land on the dashboard. The browser
talks to the proxy on `:8080`, which authenticates and forwards to the backend on `:8081`. Get
`FORTE_API_TOKEN` and your project ID from the Forte dashboard (Project → API tokens).

> Next.js only inlines `NEXT_PUBLIC_*` variables into browser code. This app reads
> `FORTE_PROJECT_ID` — the canonical name Forte injects, and the same one the backend service uses —
> by listing it under `env` in `next.config.ts`. Only do that for values that are safe to publish; a
> project id names the project and authorizes nothing.

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

Then give the service a database — this part is done in the console, since databases have no CLI yet:

1. **Project → Databases → Create database**, pick Postgres, and wait for it to go **Active**.
2. Open it, choose **Connect to a service**, and pick the backend service.
3. Leave the environment variable as `DATABASE_URL` (the default) and confirm.

Forte creates a dedicated Postgres role for that service, sets `DATABASE_URL` on it, and redeploys.
You never see or copy the password, and it is never returned by the API — the service is simply
started with the variable already set. Disconnecting reverses all of it: the role is dropped and the
variable removed.

If your app reads discrete variables instead of a URL, map those instead — the connect dialog lets
you set any of host, port, database, username and password by name, and Forte suggests the ones your
framework expects.

Notes:
- `--auth-exclude /health` lets Forte's health check reach the service without a logged-in user.
  This example's `/health` runs `SELECT 1`, so a broken database fails the health check and the
  deploy rolls back instead of going live broken.
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
