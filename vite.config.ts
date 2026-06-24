import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const backendUrl = process.env.VITE_SUPABASE_URL || "https://zmmuwinmtsczewmgysnl.supabase.co";
const backendPublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_GpdoGJmcHnFwpwfg8Yrf6w_T974UOj0";
const backendProjectId = process.env.VITE_SUPABASE_PROJECT_ID || "zmmuwinmtsczewmgysnl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(backendUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(backendPublishableKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(backendProjectId),
  },
}));
