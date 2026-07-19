import type { NextConfig } from "next";

// This project is an SSR application and can be deployed as a Forte Website.
// However, backend resources should be deployed as Forte Services -- so it's wise to duplicate or separate the backend/frontend deployments on Forte.
const nextConfig: NextConfig = {
  // Forte injects FORTE_PROJECT_ID into every website build. Next.js only inlines variables
  // named NEXT_PUBLIC_* into browser code, so the canonical name is invisible to the client
  // bundle by default — `process.env.FORTE_PROJECT_ID` would just be undefined in the browser.
  // Listing it here inlines it at build time, so the app can read the one canonical name Forte
  // documents rather than a framework-specific alias.
  //
  // Only safe because a project id is public — it identifies the project, it does not authorize
  // anything. Never do this with a secret: whatever you list here ships to every visitor.
  env: {
    FORTE_PROJECT_ID: process.env.FORTE_PROJECT_ID,
  },
};

export default nextConfig;
