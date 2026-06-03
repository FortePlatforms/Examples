import { ForteClient } from "@forteplatforms/sdk";

/**
 * A single server-side ForteClient.
 *
 * Inside a Forte *service*, FORTE_API_TOKEN is injected automatically and `new ForteClient()`
 * reads it from the environment. That token authorizes the server-side `forte.projects.*` API,
 * which acts as the project owner (it can read and modify any user in the project).
 *
 * A Forte *website* never receives FORTE_API_TOKEN — shipping a project-owner token to the
 * browser would let any visitor act as the owner. That is exactly why this backend is a
 * service, not part of the website. See the README.
 */
export const forte = new ForteClient();

export function getProjectId(): string {
  const projectId = process.env.FORTE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "FORTE_PROJECT_ID is not set. On Forte it is injected into your service automatically; " +
        "locally, set it in .env.",
    );
  }
  return projectId;
}
