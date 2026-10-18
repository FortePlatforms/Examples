import pg from "pg";

/**
 * Postgres connection pool.
 *
 * In production, connect a Forte managed database to this service and keep `DATABASE_URL` as the
 * variable name. Forte creates a Postgres role for the service, sets the variable, and redeploys.
 * Locally, point it at your own Postgres (see the README).
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Locally, copy .env.example to .env and start Postgres. " +
      "In production, connect a database to this service from the Forte console or CLI.",
  );
}

// Forte's managed Postgres already includes a certificate for encryption in transit
export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined,
});

// The pool emits `error` when an idle connection drops, which happens routinely (idle timeouts,
// database maintenance). Unhandled, that event crashes the process. The pool replaces the
// connection on its own, so logging is all that's needed.
pool.on("error", (err) => {
  console.error("Idle Postgres client error (the pool will replace it)", err);
});

/**
 * Create the schema if it doesn't exist. A real app should use a migration tool; running the DDL
 * on boot keeps this example to one step. `IF NOT EXISTS` makes it safe on every start and on
 * instances that start at the same time.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id          BIGSERIAL   PRIMARY KEY,
      user_id     TEXT        NOT NULL,
      body        TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Matches the list query: filter on user_id, page newest-first by id.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS notes_user_id_id_idx
      ON notes (user_id, id DESC)
  `);
}

export type Note = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};
