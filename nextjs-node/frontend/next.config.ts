import type { NextConfig } from "next";

// Deployed as a Forte website: Forte builds and hosts it, but requests don't pass through the
// Forte gateway and FORTE_API_TOKEN is never set. Server-side work belongs in ../backend.
const nextConfig: NextConfig = {};

export default nextConfig;
