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
});
