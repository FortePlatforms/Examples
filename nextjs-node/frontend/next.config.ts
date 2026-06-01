import type { NextConfig } from "next";

// `output: "export"` produces a purely static site — there is no server runtime at all.
// That is deliberate: this app is deployed as a Forte *website* (frontend only). With no
// server, there is nowhere a project-owner secret like FORTE_API_TOKEN could live, which is
// exactly the guarantee a website should make. All privileged work happens in the backend
// service. See the README.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
