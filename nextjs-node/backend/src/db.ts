import pg from "pg";

/**
 * Postgres connection pool.
 *
 * `DATABASE_URL` is set for you in production: connect a Forte managed database to this service
 * (console -> Databases -> Connect) and pick `DATABASE_URL` as the variable name. Forte creates a
 * dedicated Postgres role for the service, writes the connection string into the environment, and
 * redeploys. Nothing is copied by hand, and the password never appears in the console or the API.
 *
 * Locally you point it at your own Postgres — see the README.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Locally, copy .env.example to .env and start Postgres. " +
      "In production, connect a database to this service from the Forte console.",
  );
}

/**
 * Forte's managed Postgres terminates TLS at PgBouncer using a public certificate, so the default
 * verification works. A local Postgres in Docker speaks plaintext, so TLS is off there.
 */
export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined,
});

/**
 * Required, not optional. `Pool` emits `error` when a connection sitting *idle* in the pool is
 * dropped — and an unhandled `error` event takes down the Node process. Idle connections get
 * dropped as a matter of course: PgBouncer times them out, and the database is patched and failed
 * over underneath you. Without this listener the service would crash on a perfectly normal event,
 * and it would look like the platform was at fault.
 *
 * There is nothing to do but log. The pool discards the dead connection itself, and the next query
 * transparently opens a fresh one.
 */
pool.on("error", (err) => {
  console.error("Idle Postgres client error (the pool will replace it)", err);
});

/**
 * Create the schema if it isn't there yet, then hand back.
 *
 * A real application should use a migration tool — this example runs the DDL on boot so there is
 * one less thing between you and a working deployment. It is safe to run on every start and on
 * every instance: `IF NOT EXISTS` makes it idempotent, so concurrent instances racing at startup
 * converge on the same schema rather than fighting.
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
  // Every query filters by user_id, so it leads the index. created_at follows it because the list
  // endpoint sorts on it — together they serve the read without touching the table.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS notes_user_id_created_at_idx
      ON notes (user_id, created_at DESC)
  `);
}

export type Note = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};
