// First, so .env is loaded before any module below reads process.env at import time.
import "./env.js";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { forte, getProjectId } from "./forte.js";
import { resolveUser } from "./auth.js";
import { ensureSchema, pool, type Note } from "./db.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8080);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

/**
 * CORS. The frontend is a separate Forte *website* on its own origin, so the browser makes
 * cross-origin requests to this service. A service must allow that origin and the Authorization
 * header, and answer the preflight OPTIONS request. Browsers never send credentials on a
 * preflight, so OPTIONS carries no auth and we short-circuit it here.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/**
 * Public health check. Add `/health` as an authentication exclusion on the service so Forte
 * can probe it without a logged-in user (see the README → Deploy to Forte).
 *
 * It touches the database on purpose. A health check that only proves the process is listening
 * will pass while every real request 500s on a bad connection string — this way a deploy with a
 * broken database fails the health check and rolls back instead of going live broken.
 */
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    console.error("Health check failed: database unreachable", e);
    res.status(503).json({ ok: false, error: "database unreachable" });
  }
});

/** Authenticated: return the signed-in user's full record from the server-side API. */
app.get("/api/me", async (req: Request, res: Response) => {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json(user);
});

/**
 * Authenticated mutation: merge a patch into the user's customMetadataAttributes. Forte stores
 * string values only, so we coerce; merging against the current map preserves keys the client
 * didn't send. Send a value of null to delete a key.
 */
app.put("/api/me/attributes", async (req: Request, res: Response) => {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const patch = (req.body ?? {}) as Record<string, string | number | null | undefined>;

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(user.customMetadataAttributes ?? {})) {
    if (v !== null && v !== undefined) merged[k] = String(v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete merged[k];
    } else if (v !== undefined) {
      merged[k] = String(v);
    }
  }

  const updated = await forte.projects.putUserCustomAttributes({
    projectId: getProjectId(),
    userId: user.userId,
    requestBody: merged,
  });
  res.json(updated);
});

/**
 * Notes: a small CRUD resource backed by Postgres.
 *
 * The user's preferences above live in Forte's `customMetadataAttributes` — a flat string map
 * hanging off one user record. That's the right home for a handful of settings. Notes are rows:
 * there are many per user, you list them in an order, you delete one by id. That's a database.
 *
 * The rule every handler below follows: **`user_id` is in the WHERE clause of every statement**,
 * writes included — never only on the read. The Forte user id the gateway gives us is the tenant
 * key, so a note id on its own is never enough to address a row. Filtering only on `id` for an
 * update or delete would let any signed-in user edit any other user's note by guessing a number.
 * The pattern below makes that structurally impossible rather than relying on a check somewhere.
 */

/** Resolve the caller, or answer 401. Returns null when it has already sent the response. */
async function requireUser(req: Request, res: Response) {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  return user;
}

app.get("/api/notes", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { rows } = await pool.query<Note>(
    "SELECT id, user_id, body, created_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC",
    [user.userId],
  );
  res.json(rows);
});

app.post("/api/notes", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    res.status(400).json({ error: "body is required" });
    return;
  }

  // Parameterised, not interpolated — the only safe way to put a user's text into SQL.
  const { rows } = await pool.query<Note>(
    "INSERT INTO notes (user_id, body) VALUES ($1, $2) RETURNING id, user_id, body, created_at",
    [user.userId, body],
  );
  res.status(201).json(rows[0]);
});

app.patch("/api/notes/:id", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    res.status(400).json({ error: "body is required" });
    return;
  }

  // `AND user_id = $3`, not just `WHERE id = $2`. Another user's note simply matches no rows and
  // comes back as a 404 — it is never loaded, never compared, never updated.
  const { rows } = await pool.query<Note>(
    "UPDATE notes SET body = $1 WHERE id = $2 AND user_id = $3 RETURNING id, user_id, body, created_at",
    [body, req.params.id, user.userId],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rows[0]);
});

app.delete("/api/notes/:id", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { rowCount } = await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [
    req.params.id,
    user.userId,
  ]);
  if (rowCount === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(204).end();
});

// Create the schema before accepting traffic, so the first request never races the DDL.
await ensureSchema();

app.listen(PORT, () => {
  console.log(`Backend service listening on http://localhost:${PORT}`);
});
