// First, so .env is loaded before any module below reads process.env at import time.
import "./env.js";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { forte, getProjectId } from "./forte.js";
import { resolveUser } from "./auth.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8080);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

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
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
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

app.listen(PORT, () => {
  console.log(`Backend service listening on http://localhost:${PORT}`);
});
