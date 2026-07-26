import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

// ── PlantUML TeaVM engine (@plantuml/core) ──
// The engine is served as static vendor assets rather than bundled: plantuml.js
// is a ~7 MB pre-built ES module (and viz-global.js a classic script) that the
// app loads lazily at runtime, so running them through Rollup would only slow
// builds and break the classic-script loading order. The path is versioned so
// nginx's immutable caching stays correct across engine upgrades.
const require = createRequire(import.meta.url);
const plantumlPkg = require("@plantuml/core/package.json");
const plantumlDir = path.dirname(require.resolve("@plantuml/core/package.json"));
const PLANTUML_VENDOR_BASE = `/vendor/plantuml/${plantumlPkg.version}/`;
// Loaded explicitly by URL from the versioned base (immutable-cacheable).
const PLANTUML_ENGINE_FILES = ["plantuml.js", "viz-global.js"];
// The engine fetches these relative to the *page* URL at runtime (e.g.
// /documents/emoji.js), so they are emitted at a stable unversioned path that
// nginx rewrites such requests to.
const PLANTUML_RUNTIME_FETCHED = ["emoji.js", "openiconic.js"];

function plantumlVendor(): Plugin {
  return {
    name: "plantuml-vendor",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        let file: string | null = null;
        if (url.startsWith(PLANTUML_VENDOR_BASE)) {
          file = url.slice(PLANTUML_VENDOR_BASE.length);
        } else {
          // Page-relative runtime fetches from any SPA route
          const m = url.match(/\/(emoji|openiconic)\.js$/);
          if (m) file = `${m[1]}.js`;
        }
        if (
          file &&
          (PLANTUML_ENGINE_FILES.includes(file) || PLANTUML_RUNTIME_FETCHED.includes(file))
        ) {
          res.setHeader("Content-Type", "text/javascript");
          fs.createReadStream(path.join(plantumlDir, file)).pipe(res);
          return;
        }
        next();
      });
    },
    generateBundle() {
      for (const file of PLANTUML_ENGINE_FILES) {
        this.emitFile({
          type: "asset",
          fileName: `vendor/plantuml/${plantumlPkg.version}/${file}`,
          source: fs.readFileSync(path.join(plantumlDir, file)),
        });
      }
      for (const file of PLANTUML_RUNTIME_FETCHED) {
        this.emitFile({
          type: "asset",
          fileName: `vendor/plantuml/${file}`,
          source: fs.readFileSync(path.join(plantumlDir, file)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plantumlVendor()],
  define: {
    __PLANTUML_VENDOR_BASE__: JSON.stringify(PLANTUML_VENDOR_BASE),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
