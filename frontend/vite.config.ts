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

// ── SEO head tags + sitemap ──
// The app is a client-rendered SPA, so crawlers fetching /templates or
// /templates/<slug> would otherwise get the generic shell. After the bundle
// is written, this plugin copies dist/index.html once per public template
// page and rewrites the head tags (title/description/canonical/og/twitter).
// No visible markup is injected — an earlier version put static content in
// #root, but it flashed as unstyled text until the bundle loaded. It also
// emits sitemap.xml listing every public URL. Template data comes from
// src/data/templates.json (regenerate with backend export_templates.py —
// see that file's docstring).
const SITE_ORIGIN = "https://plottedplant.com";
const templates: {
  slug: string;
  name: string;
  description: string;
  diagram_type: string;
}[] = require("./src/data/templates.json");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rewriteShell(
  shell: string,
  opts: { title: string; description: string; path: string }
): string {
  const url = `${SITE_ORIGIN}${opts.path}`;
  const title = escapeHtml(opts.title);
  const desc = escapeHtml(opts.description);
  const replacements: [RegExp, string][] = [
    [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
    [
      /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/>)/,
      `$1${desc}$2`,
    ],
    [/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`],
    [/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`],
    [
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?("\s*\/>)/,
      `$1${desc}$2`,
    ],
    [/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`],
    [/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`],
    [
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?("\s*\/>)/,
      `$1${desc}$2`,
    ],
  ];
  let out = shell;
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(out)) {
      throw new Error(
        `seo-prerender: pattern ${pattern} not found in built index.html for ${opts.path}`
      );
    }
    out = out.replace(pattern, replacement);
  }
  return out;
}

function seoPrerender(): Plugin {
  return {
    name: "seo-prerender",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const shell = fs.readFileSync(path.join(distDir, "index.html"), "utf8");

      // /templates gallery page
      fs.writeFileSync(
        path.join(distDir, "templates", "index.html"),
        rewriteShell(shell, {
          title: "PlantUML Templates & Examples – PlottedPlant",
          description:
            "Browse free PlantUML templates and examples: sequence, class, activity, state, component, deployment, and use case diagrams. Preview each one and open it in the free PlottedPlant editor.",
          path: "/templates",
        })
      );

      // /templates/<slug> detail pages
      for (const t of templates) {
        const typeLabel = t.diagram_type.replace(/_/g, " ");
        const dir = path.join(distDir, "templates", t.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "index.html"),
          rewriteShell(shell, {
            title: `${t.name} PlantUML Template – PlottedPlant`,
            description: `${t.description} Free PlantUML ${typeLabel} diagram template — preview the rendered diagram, copy the source, and edit it online with PlottedPlant.`,
            path: `/templates/${t.slug}`,
          })
        );
      }

      // sitemap.xml
      const today = new Date().toISOString().slice(0, 10);
      const urls = [
        { loc: "/", priority: "1.0" },
        { loc: "/templates", priority: "0.8" },
        ...templates.map((t) => ({
          loc: `/templates/${t.slug}`,
          priority: "0.6",
        })),
      ];
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${SITE_ORIGIN}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
      fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemap);
      this.info(
        `seo-prerender: wrote sitemap.xml and per-page head tags for ${templates.length + 1} pages`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plantumlVendor(), seoPrerender()],
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
