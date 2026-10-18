import { ForteClient } from "@forteplatforms/sdk";

// Browser-side Forte client, created without an API token. The end-user API (`forte.users.*`)
// is authenticated by the user's own login, so it is safe in the browser. The project-owner API
// (`forte.projects.*`) needs FORTE_API_TOKEN, which a website never receives; those calls live in
// the backend service.
export const forte = new ForteClient();

// Forte sets VITE_FORTE_PROJECT_ID on every website build. A project id is public: it names the
// project and authorizes nothing.
export function getProjectId(): string | undefined {
  return import.meta.env.VITE_FORTE_PROJECT_ID;
}

/** A readable message for a failed SDK call. Forte error bodies carry `errorCode` and `message`. */
export async function describeForteError(err: unknown, fallback: string): Promise<string> {
  const response = (err as { response?: unknown } | null)?.response;
  if (response instanceof Response) {
    const body = (await response.json().catch(() => null)) as {
      errorCode?: string;
      message?: string;
    } | null;
    return body?.message ?? body?.errorCode ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}
