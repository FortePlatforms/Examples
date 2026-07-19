import { ForteClient } from "@forteplatforms/sdk";

// Browser-side Forte client. No API token: `forte.users.*` is authenticated by the end user
// themselves (login returns a session token), so it is safe to call from the browser.
//
// `forte.projects.*` — the project-owner API — is intentionally NOT used here. It requires
// FORTE_API_TOKEN, which a website never has (and must never ship to the browser). That work
// lives in the backend service. See the README.
export const forte = new ForteClient();

// FORTE_PROJECT_ID is the canonical name Forte injects — into services, and into websites at
// build time. Reading it here (rather than a VITE_ alias) means the same variable name works
// across this website and the backend service. It reaches the browser bundle because
// vite.config.ts adds FORTE_ to `envPrefix`; see the comment there.
export function getProjectId(): string {
  const projectId = import.meta.env.FORTE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "FORTE_PROJECT_ID is not set. On Forte it is injected into your website automatically; " +
        "locally, set it in .env.local.",
    );
  }
  return projectId;
}
