// First, so .env is loaded before any module below reads process.env at import time.
import "./env.js";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { forte, getProjectId } from "./forte.js";
import { getUser, getUserId } from "./auth.js";
import { ensureSchema, pool, type Note } from "./db.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8080);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

/**
 * CORS. The website is on a different origin, so the browser sends a preflight OPTIONS request
 * before any call with an Authorization header or a non-simple method. The gateway passes
 * OPTIONS through without auth, and this handler answers it.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/**
 * Health check. It queries the database so a deploy with a bad DATABASE_URL fails its health
 * check and rolls back, instead of going live and returning 500s.
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

/** The signed-in user's record, loaded with the server-side API. */
app.get("/api/me", async (req: Request, res: Response) => {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json(user);
});

/**
 * Preferences the user may edit. The request body comes from the browser, so only these keys
 * are accepted. Never let this endpoint write a key your app uses for access decisions, such as
 * a plan or a role: the user could grant it to themselves.
 */
const PREFERENCE_RULES: Record<string, (value: string) => boolean> = {
  favoriteColor: (value) => value.length <= 32,
  theme: (value) => ["light", "dark", "system"].includes(value),
};

/**
 * Merge a patch into the user's customMetadataAttributes. A null value deletes the key.
 *
 * putUserCustomAttributes replaces the whole map, so this reads the current map and writes back
 * the merge. Two writes at the same moment can lose one of them, which is acceptable for
 * preferences. Don't keep counters or other contended values here; use the database.
 */
app.put("/api/me/attributes", async (req: Request, res: Response) => {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const patch = (req.body ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    const isValid = PREFERENCE_RULES[key];
    if (!isValid || (value !== null && (typeof value !== "string" || !isValid(value)))) {
      res.status(400).json({ error: `invalid preference: ${key}` });
      return;
    }
  }

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(user.customMetadataAttributes ?? {})) {
    if (value !== null && value !== undefined) merged[key] = String(value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value as string;
  }

  const updated = await forte.projects.putUserCustomAttributes({
    projectId: getProjectId(),
    userId: user.userId,
    requestBody: merged,
  });
  res.json(updated);
});

/**
 * Notes: a small CRUD resource in Postgres.
 *
 * Every statement filters on user_id, including updates and deletes. The note id alone never
 * addresses a row, so another user's note matches nothing and returns 404. These handlers only
 * need the id, so they read the header and skip the getUser call.
 */

const NOTES_PAGE_SIZE = 20;
const NOTE_ID_PATTERN = /^\d+$/;

function requireUserId(req: Request, res: Response): string | null {
  const userId = getUserId(req);
  if (!userId) res.status(401).json({ error: "unauthenticated" });
  return userId;
}

/** One page of notes, newest first. Pass the returned nextCursor as ?cursor= for the next page. */
app.get("/api/notes", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  if (cursor !== null && !NOTE_ID_PATTERN.test(cursor)) {
    res.status(400).json({ error: "invalid cursor" });
    return;
  }

  // Keyset pagination on id, served by the (user_id, id DESC) index. Fetch one extra row to
  // learn whether another page exists.
  const { rows } = await pool.query<Note>(
    `SELECT id, user_id, body, created_at FROM notes
      WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint)
      ORDER BY id DESC
      LIMIT $3`,
    [userId, cursor, NOTES_PAGE_SIZE + 1],
  );
  const notes = rows.slice(0, NOTES_PAGE_SIZE);
  const nextCursor = rows.length > NOTES_PAGE_SIZE ? notes[notes.length - 1].id : null;
  res.json({ notes, nextCursor });
});

app.post("/api/notes", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    res.status(400).json({ error: "body is required" });
    return;
  }

  const { rows } = await pool.query<Note>(
    "INSERT INTO notes (user_id, body) VALUES ($1, $2) RETURNING id, user_id, body, created_at",
    [userId, body],
  );
  res.status(201).json(rows[0]);
});

app.patch("/api/notes/:id", async (req: Request<{ id: string }>, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    res.status(400).json({ error: "body is required" });
    return;
  }
  if (!NOTE_ID_PATTERN.test(req.params.id)) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const { rows } = await pool.query<Note>(
    "UPDATE notes SET body = $1 WHERE id = $2 AND user_id = $3 RETURNING id, user_id, body, created_at",
    [body, req.params.id, userId],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rows[0]);
});

app.delete("/api/notes/:id", async (req: Request<{ id: string }>, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  if (!NOTE_ID_PATTERN.test(req.params.id)) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const { rowCount } = await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [
    req.params.id,
    userId,
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
