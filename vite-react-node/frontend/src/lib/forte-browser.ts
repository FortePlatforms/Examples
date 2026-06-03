import { ForteClient } from "@forteplatforms/sdk";

// Browser-side Forte client. No API token: `forte.users.*` is authenticated by the end user
// themselves (login returns a session token), so it is safe to call from the browser.
//
// `forte.projects.*` — the project-owner API — is intentionally NOT used here. It requires
// FORTE_API_TOKEN, which a website never has (and must never ship to the browser). That work
// lives in the backend service. See the README.
export const forte = new ForteClient();

export function getProjectId(): string {
  const projectId = import.meta.env.VITE_FORTE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "VITE_FORTE_PROJECT_ID is not set. On Forte it is injected into your website " +
        "automatically; locally, set it in .env.local.",
    );
  }
  return projectId;
}
