import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

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
    hmr: {
      overlay: false,
    },
  },
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    // Add cache-bust timestamp to index.html script tag AFTER build rewrites it.
    // This runs after Rollup has written the final index.html, so we can safely modify it.
    {
      name: 'cache-bust-index-html',
      apply: 'build',
      writeBundle(options, bundle) {
        const htmlAsset = Object.keys(bundle).find(k => k === 'index.html');
        if (!htmlAsset) return;
        const timestamp = Date.now();
        const html = (bundle[htmlAsset] as any).source as string;
        const updated = html.replace(
          /(<script type="module" crossorigin src=")(\/assets\/index-[^\"]+)(")/,
          `$1$2?v=${timestamp}$3`
        );
        const outputDir = options.dir || 'dist';
        writeFileSync(`${outputDir}/index.html`, updated, 'utf8');
      }
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
