import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A static single-page app, deployed as a Forte website. Forte sets VITE_FORTE_PROJECT_ID on the
// build; FORTE_API_TOKEN is never set on websites, so privileged work lives in ../backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
