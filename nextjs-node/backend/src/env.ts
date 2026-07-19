/**
 * Load `.env` for local development.
 *
 * On Forte the environment is injected into the container directly and there is no `.env` file —
 * the miss below is expected and harmless. `process.loadEnvFile` is built into Node, so this
 * costs no dependency.
 *
 * Import this module *before* anything that reads `process.env` at module scope. ES modules
 * evaluate in import order, so `index.ts` listing it first is what makes that hold.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file. Expected in production; locally, copy .env.example to .env.
}
