// First, so .env is loaded before any module below reads process.env at import time.
import "./env.js";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { forte, getProjectId } from "./forte.js";
import { getUser } from "./auth.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8080);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

/**
 * CORS. The website is on a different origin, so the browser sends a preflight OPTIONS request
 * before any call with an Authorization header or a non-simple method. The gateway passes
 * OPTIONS through without auth, and this handler answers it.
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

/** Health check, excluded from authentication (see the README). */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
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
 * preferences. Don't keep counters or other contended values here; use a database.
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

app.listen(PORT, () => {
  console.log(`Backend service listening on http://localhost:${PORT}`);
});
