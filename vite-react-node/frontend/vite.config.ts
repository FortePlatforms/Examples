import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This app is built as a purely static single-page application and deployed as a Forte
// *website* (frontend only). `vite build` emits a static `dist/` directory — there is no server
// runtime, so there is nowhere a project-owner secret like FORTE_API_TOKEN could live. That is
// exactly the guarantee a website should make; all privileged work happens in the backend
// service. See the README.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Forte injects FORTE_PROJECT_ID into every website build. Vite only exposes variables whose
  // names start with an allowed prefix to the browser bundle — by default just VITE_ — so the
  // canonical name would be missing from `import.meta.env` without this. Adding FORTE_ lets the
  // app read the one name Forte documents instead of a Vite-specific alias.
  //
  // Widening a prefix deserves a second look, so to be precise about what it does: Vite inlines
  // the specific `import.meta.env.X` keys your source reads, not every variable matching the
  // prefix — a FORTE_API_TOKEN sitting in the build environment does not end up in `dist/` just
  // because it matches. It would only ship if code referenced it, or read `import.meta.env`
  // wholesale (Vite serializes the entire exposed set for that).
  //
  // The real guarantee is upstream: Forte never injects FORTE_API_TOKEN into a website at all
  // (see ForteInjectedWebAppEnvVars), because a website's code runs in the visitor's browser.
  // A project id is public — it names the project, it authorizes nothing.
  envPrefix: ["VITE_", "FORTE_"],
});
