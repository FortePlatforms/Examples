/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Injected automatically by Forte for a *website*; set locally in .env.local. Exposed to the
  // bundle by the FORTE_ entry in vite.config.ts `envPrefix`.
  readonly FORTE_PROJECT_ID?: string;
  // The backend *service* URL. Set it yourself (env var on Forte, .env.local for dev).
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
