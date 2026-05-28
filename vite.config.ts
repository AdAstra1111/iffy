import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";

// Force dependency re-optimization v3

const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();
const buildTime = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api/supabase-proxy': {
        target: 'https://hdfderbphdobomkdjypc.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase-proxy\//, ''),
      },
    },
    hmr: {
      overlay: false,
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    {
      name: "post-build-cache-bust",
      closeBundle() {
        // Runs after build completes and all files are written
        // Appends build timestamp as query param to the script src
        // Safe — pure file I/O after Rollup's module graph is finalized
        const htmlPath = path.resolve(__dirname, "dist/index.html");
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, "utf8");
        const ts = Date.now();
        const updated = html.replace(
          /(<script[^>]+src=")(\/assets\/[^"]+)(")/,
          `$1$2?v=${ts}$3`
        );
        if (updated !== html) {
          fs.writeFileSync(htmlPath, updated, "utf8");
          console.log(`[post-build-cache-bust] Added ?v=${ts} to script src in dist/index.html`);
        }
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split node_modules — never split app src files (avoids circular deps)
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) return "vendor-react";
          if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) return "vendor-charts";
          if (id.includes("node_modules/framer-motion")) return "vendor-motion";
          if (id.includes("node_modules/@tanstack/")) return "vendor-query";
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) return "vendor-export";
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/@radix-ui/")) return "vendor-radix";
          if (id.includes("node_modules/zod") || id.includes("node_modules/react-hook-form")) return "vendor-forms";
          if (id.includes("node_modules/date-fns") || id.includes("node_modules/dayjs")) return "vendor-dates";
          // All app src code splits naturally via dynamic import() in App.tsx
        },
      },
    },
  },
}));
