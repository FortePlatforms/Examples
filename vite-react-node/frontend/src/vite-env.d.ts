/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Set by Forte on website builds; set it in .env.local for local development.
  readonly VITE_FORTE_PROJECT_ID?: string;
  // The backend service URL. Set by the website's service connection, or .env.local locally.
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
