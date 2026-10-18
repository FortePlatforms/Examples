# Forte example: Next.js website + Node service

A Forte app split into two deployments:

- `frontend/` is a Next.js app deployed as a Forte website. It signs users in with the Forte SDK in
  the browser and calls the backend for everything else.
- `backend/` is an Express app deployed as a Forte service. It reads the signed-in user from the
  gateway, calls the server-side Forte API with `FORTE_API_TOKEN`, and stores notes in a Forte
  managed Postgres database.

For the single-app alternative, where one Next.js codebase is deployed as a service, see
[`../nextjs-service`](../nextjs-service).

## Why the backend is a separate service

Forte websites, static or server-rendered, are served without passing through the Forte gateway.
That means a website doesn't get the things a service does:

| | Website (`frontend/`) | Service (`backend/`) |
|---|---|---|
| `FORTE_API_TOKEN` for `forte.projects.*` | Never set | Set automatically |
| Requests authenticated, `X-Forte-User-Id` set | No | Yes |
| Request logs and metrics | No | Yes |

`FORTE_API_TOKEN` acts as the project owner and can read or change any user. Code that needs it, or
needs to know who is calling, goes in a service.

See [Websites](https://forteplatforms.com/docs/core-concepts/websites),
[Services](https://forteplatforms.com/docs/core-concepts/services), and
[API surfaces](https://forteplatforms.com/docs/core-concepts/api-surfaces).

## How a request flows

```
Browser (page from the website)
  │  1. forte.users.passwordLogin or OTP login ─────────►  Forte user API
  │     returns a session token
  │
  │  2. fetch(BACKEND_URL/api/me,
  │       Authorization: Bearer <sessionToken>) ────────►  Forte gateway
  │                                                         │ checks the session token
  │                                                         │ sets X-Forte-User-Id
  │                                                         ▼
  │                                                       Backend service
  │                                                         │ forte.projects.getUser(...)
  │  3. JSON user record ◄─────────────────────────────────┘ (uses FORTE_API_TOKEN)
```

1. The browser signs in with the end-user API (`forte.users.*`). No API token is involved. Login
   returns a session token.
2. The browser calls the service with the token in an `Authorization: Bearer` header. The gateway
   checks it, removes any `X-Forte-*` headers the client sent, and forwards the request with
   `X-Forte-User-Id` set. Locally, `forte proxy` does the same.
3. The service reads `X-Forte-User-Id` and calls `forte.projects.*` with its token.

The browser can also read its own user record with `forte.users.getAccount`. This example goes
through the service to show the `X-Forte-User-Id` handoff.

| File | What it shows |
|------|---------------|
| `frontend/app/login/page.tsx` | Sign-up with email verification, password sign-in, and one-time-code sign-in, all from the browser. |
| `frontend/lib/session.ts` | Keeps the session token in `sessionStorage`. |
| `frontend/lib/api.ts` | `backendFetch()` sends the token to the service as a Bearer header. |
| `backend/src/auth.ts` | Reads the user id from `X-Forte-User-Id`, and loads the full record when a handler needs it. |
| `backend/src/index.ts` | CORS for the website origin, `GET /health`, `GET /api/me`, `PUT /api/me/attributes`, and paginated `/api/notes` CRUD. |
| `backend/src/db.ts` | The Postgres pool and schema. |

## Sign-in

- **Sign-up.** `registerUser` emails a verification code and returns a session that can only verify
  that email. The user enters the code (`verifyContactMethod`), then the page signs in with
  `passwordLogin`, which only accepts verified emails.
- **Password sign-in.** `passwordLogin` returns a session token.
- **One-time code.** `createOtpLogin` sends a code if the email has an account, and returns the same
  response either way so it can't be used to check who has signed up. New users sign up on the
  Password tab.
- **MFA.** If the project requires MFA, login returns a pending token that the gateway rejects.
  This example shows an error in that case. See
  [MFA](https://forteplatforms.com/docs/core-concepts/users/mfa) for the challenge and verify steps.

## Preferences and notes

Preferences are stored in the user's `customMetadataAttributes`, a map of string keys to string
values on the Forte user record. It suits a few small settings. `putUserCustomAttributes` replaces
the whole map, so the service reads the current map, merges the change, and writes it back. Two
writes at the same moment can lose one of them.

The service only accepts the preference keys it knows (`favoriteColor`, `theme`). The request body
comes from the browser, so an endpoint that wrote any key would let users set values your app might
later trust, such as a plan or a role.

Notes are rows in Postgres. There are many per user, they're listed in order, and they're edited
one at a time. If you'd write `WHERE`, `ORDER BY`, or `LIMIT` against the data, it belongs in a
database.

Every SQL statement filters on `user_id`, including updates and deletes:

```sql
UPDATE notes SET body = $1 WHERE id = $2 AND user_id = $3
```

Without `AND user_id = $3`, any signed-in user could edit another user's note by guessing its id.
With it, someone else's note matches no rows and the service returns 404. The list endpoint returns
20 notes at a time and a `nextCursor` for the next page.

This example sends the session token as a Bearer header, which works across origins. To keep the
token out of JavaScript, use an httpOnly cookie through the service's `/_forte` path instead. See
[First-party cookies via `/_forte`](https://forteplatforms.com/docs/core-concepts/sdks#first-party-cookies-via-_forte).

## Run locally

The backend trusts `X-Forte-User-Id` and does no token checks of its own. Locally, `forte proxy`
runs in front of it, authenticates each request against Forte, and sets the same header. The proxy
listens on `:8080` and forwards to the backend on `:8081`.

The proxy needs a Forte service to authenticate against, so deploy the backend first (see
[Deploy](#deploy)).

1. Start Postgres:

   ```bash
   docker run -d --name forte-example-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
   ```

   The backend creates its table on startup.

2. Start the backend:

   ```bash
   cd backend
   cp .env.example .env   # set FORTE_API_TOKEN and FORTE_PROJECT_ID
   bun install
   bun run dev            # http://localhost:8081
   ```

   `.env.example` already points `DATABASE_URL` at the container above.

3. Start `forte proxy` in front of the backend:

   ```bash
   forte proxy --project-id <projectId> --service-id <serviceId> -p 8081
   ```

4. Start the frontend:

   ```bash
   cd frontend
   cp .env.example .env.local   # set NEXT_PUBLIC_FORTE_PROJECT_ID
   bun install
   bun run dev                  # http://localhost:3000
   ```

Open <http://localhost:3000> and sign up. Get `FORTE_API_TOKEN` and your project ID from the Forte
console (Project → API tokens).

## Deploy

The paths below assume this folder is at `nextjs-node/` in your repository. Adjust `--base-dir` if
it isn't.

1. Create a Postgres database and wait for it to become `ACTIVE`:

   ```bash
   forte databases create <projectId> --name notes
   forte databases get <projectId> <databaseId>
   ```

2. Create the backend service with the database connected. Forte creates a Postgres role for the
   service and sets `DATABASE_URL`. `FORTE_API_TOKEN` and `FORTE_PROJECT_ID` are set automatically.

   ```bash
   forte services create <projectId> \
     --name my-app-backend \
     --repo <githubHttpsUrl> --branch main \
     --base-dir nextjs-node/backend \
     --database <databaseId> \
     --env FRONTEND_ORIGIN=https://<your-website>.sites.tryforte.dev
   ```

3. Exclude `/health` from authentication. Exclusions are set with `update`; `create` ignores them.

   ```bash
   forte services update <projectId> <serviceId> --auth-exclude /health
   ```

   `/health` runs `SELECT 1`, so a deploy with a broken database connection fails its health check.

4. Create the website and give it the service URL as `NEXT_PUBLIC_BACKEND_URL`. Forte sets
   `NEXT_PUBLIC_FORTE_PROJECT_ID` on the build.

   ```bash
   forte websites create <projectId> \
     --name my-app-frontend \
     --repo <githubHttpsUrl> --branch main \
     --base-dir nextjs-node/frontend
   forte websites connections add <projectId> <websiteId> <serviceId> --var NEXT_PUBLIC_BACKEND_URL
   ```

5. If the website URL differs from the `FRONTEND_ORIGIN` you set in step 2, update it:

   ```bash
   forte services update <projectId> <serviceId> --env FRONTEND_ORIGIN=<websiteUrl>
   ```

   `--env` on update replaces all environment variables, so include any others you've set.

See the [monorepo guide](https://forteplatforms.com/docs/guides/monorepo) for more on deploying
both from one repository.

## Choosing between this and one Next.js service

- **Website + service (this example).** The frontend can't hold a server secret, and the two deploy
  separately. Use it when you want a static or CDN-served frontend apart from the backend.
- **One Next.js app as a service** ([`../nextjs-service`](../nextjs-service)). API routes and Server
  Components run behind the gateway, so they get `FORTE_API_TOKEN`, `X-Forte-User-Id`, and request
  logs. Use it when frontend and backend change together.

Don't deploy a Next.js app that depends on `FORTE_API_TOKEN`, `X-Forte-User-Id`, or request logs as
a website. A website gets none of them.
