# Forte example: React SPA website + Node service

A Forte app whose frontend is a single-page app:

- `frontend/` is a React app built with [Vite](https://vite.dev) and deployed as a Forte website.
  It signs users in with the Forte SDK in the browser and calls the backend for everything else.
- `backend/` is an Express app deployed as a Forte service. It reads the signed-in user from the
  gateway and calls the server-side Forte API with `FORTE_API_TOKEN`.

[`../nextjs-node`](../nextjs-node) has the same split with a Next.js frontend, plus a Postgres
database.

## Why the backend is a separate service

`vite build` produces static HTML, CSS, and JavaScript that every visitor downloads, so there is
nowhere in the frontend to keep a secret. Forte websites are also served without passing through
the Forte gateway, so they don't get what a service gets:

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

## Client-side routes

react-router handles `/login` and `/dashboard`. Forte serves `index.html` for any path on a static
website, so opening or refreshing `/dashboard` works without a `_redirects` file or `404.html`.

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

| File | What it shows |
|------|---------------|
| `frontend/src/pages/LoginPage.tsx` | Sign-up with email verification, password sign-in, and one-time-code sign-in, all from the browser. |
| `frontend/src/lib/session.ts` | Keeps the session token in `sessionStorage`. |
| `frontend/src/lib/api.ts` | `backendFetch()` sends the token to the service as a Bearer header. |
| `frontend/src/App.tsx` | Client-side routes. |
| `backend/src/auth.ts` | Reads the user id from `X-Forte-User-Id`, and loads the full record when a handler needs it. |
| `backend/src/index.ts` | CORS for the website origin, `GET /health`, `GET /api/me`, `PUT /api/me/attributes`. |

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

## Preferences

Preferences are stored in the user's `customMetadataAttributes`, a map of string keys to string
values on the Forte user record. The service only accepts the keys it knows (`favoriteColor`,
`theme`). The request body comes from the browser, so an endpoint that wrote any key would let users
set values your app might later trust, such as a plan or a role.

`putUserCustomAttributes` replaces the whole map, so the service reads the current map, merges the
change, and writes it back. Two writes at the same moment can lose one of them. Keep counters and
anything you query in a database.

This example sends the session token as a Bearer header, which works across origins. To keep the
token out of JavaScript, use an httpOnly cookie through the service's `/_forte` path instead. See
[First-party cookies via `/_forte`](https://forteplatforms.com/docs/core-concepts/sdks#first-party-cookies-via-_forte).

## Run locally

The backend trusts `X-Forte-User-Id` and does no token checks of its own. Locally, `forte proxy`
runs in front of it, authenticates each request against Forte, and sets the same header. The proxy
listens on `:8080` and forwards to the backend on `:8081`.

The proxy needs a Forte service to authenticate against, so deploy the backend first (see
[Deploy](#deploy)).

1. Start the backend:

   ```bash
   cd backend
   cp .env.example .env   # set FORTE_API_TOKEN and FORTE_PROJECT_ID
   npm install
   npm run dev            # http://localhost:8081
   ```

2. Start `forte proxy` in front of the backend:

   ```bash
   forte proxy --project-id <projectId> --service-id <serviceId> -p 8081
   ```

3. Start the frontend:

   ```bash
   cd frontend
   cp .env.example .env.local   # set VITE_FORTE_PROJECT_ID
   npm install
   npm run dev                  # http://localhost:5173
   ```

Open <http://localhost:5173> and sign up. Get `FORTE_API_TOKEN` and your project ID from the Forte
console (Project → API tokens).

## Deploy

The paths below assume this folder is at `vite-react-node/` in your repository. Adjust `--base-dir`
if it isn't.

1. Create the backend service. `FORTE_API_TOKEN` and `FORTE_PROJECT_ID` are set automatically.

   ```bash
   forte services create <projectId> \
     --name my-app-backend \
     --repo <githubHttpsUrl> --branch main \
     --base-dir vite-react-node/backend \
     --env FRONTEND_ORIGIN=https://<your-website>.sites.tryforte.dev
   ```

2. Exclude `/health` from authentication. Exclusions are set with `update`; `create` ignores them.

   ```bash
   forte services update <projectId> <serviceId> --auth-exclude /health
   ```

3. Create the website and give it the service URL as `VITE_BACKEND_URL`. Forte detects Vite, builds
   to `dist/`, and sets `VITE_FORTE_PROJECT_ID` on the build.

   ```bash
   forte websites create <projectId> \
     --name my-app-frontend \
     --repo <githubHttpsUrl> --branch main \
     --base-dir vite-react-node/frontend
   forte websites connections add <projectId> <websiteId> <serviceId> --var VITE_BACKEND_URL
   ```

   Vite reads `VITE_*` variables at build time. Adding or changing the connection rebuilds the
   website.

4. If the website URL differs from the `FRONTEND_ORIGIN` you set in step 1, update it:

   ```bash
   forte services update <projectId> <serviceId> --env FRONTEND_ORIGIN=<websiteUrl>
   ```

   `--env` on update replaces all environment variables, so include any others you've set.

See the [monorepo guide](https://forteplatforms.com/docs/guides/monorepo) for more on deploying
both from one repository.

## Choosing a different shape

- **SPA website + service (this example).** The frontend can't hold a server secret and is served
  as static files. The backend deploys on its own.
- **A server-rendered framework as a service.** For server-rendered pages or backend code next to
  your frontend, deploy the framework itself as a Forte service. It runs behind the gateway and gets
  `FORTE_API_TOKEN`, authenticated requests, and request logs. See
  [`../nextjs-service`](../nextjs-service).

Don't deploy a frontend that depends on `FORTE_API_TOKEN`, `X-Forte-User-Id`, or request logs as a
website. A website gets none of them.
