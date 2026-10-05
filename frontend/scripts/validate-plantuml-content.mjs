// Dev helper: check every hover-doc example and every snippet body of the
// PlantUML language service against a real PlantUML server (the one
// plantuml-check.mjs talks to; PLANTUML_CHECK_API overrides its address).
//
//   node scripts/validate-plantuml-content.mjs                 everything
//   node scripts/validate-plantuml-content.mjs src/lib/plantuml-language/core/docs-gantt.ts
//                                                              only the arrays that file exports
//   --filter <text>     only items whose id contains <text>
//   --verbose           also list passing items
//   --no-cache          ignore cached results
//   --concurrency <n>   parallel requests (default 2; keep it small)
//
// Results are cached by content hash in PLANTUML_CONTENT_CACHE (default
// node_modules/.cache/plantuml-content), so repeat runs only ask the server
// about what changed.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = "/src/lib/plantuml-language/core";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const filter = option("--filter");
const concurrency = Number(option("--concurrency") ?? 2);
const verbose = flag("--verbose");
const useCache = !flag("--no-cache");
const modules = args.filter((a, i) => !a.startsWith("--") && !["--filter", "--concurrency"].includes(args[i - 1]));

const cacheDir = process.env.PLANTUML_CONTENT_CACHE ?? path.join(root, "node_modules/.cache/plantuml-content");
fs.mkdirSync(cacheDir, { recursive: true });

// How a fragment written for one diagram kind is turned into a full document,
// and the diagram type the server reports for that kind.
const KIND_HOST = {
  sequence: { tag: "uml", type: "SEQUENCE" },
  class: { tag: "uml", type: "CLASS" },
  object: { tag: "uml", type: "CLASS" },
  er: { tag: "uml", type: "CLASS" },
  usecase: { tag: "uml", type: "DESCRIPTION" },
  component: { tag: "uml", type: "DESCRIPTION" },
  deployment: { tag: "uml", type: "DESCRIPTION" },
  archimate: { tag: "uml", type: "DESCRIPTION" },
  activity: { tag: "uml", type: "ACTIVITY" },
  "activity-legacy": { tag: "uml", type: "ACTIVITY" },
  state: { tag: "uml", type: "STATE" },
  timing: { tag: "uml", type: "TIMING" },
  nwdiag: { tag: "nwdiag", type: "NWDIAG", open: "nwdiag {", close: "}", opened: /^\s*nwdiag\b/ },
  gantt: { tag: "gantt", type: "GANTT" },
  mindmap: { tag: "mindmap", type: "MINDMAP" },
  wbs: { tag: "wbs", type: "WBS" },
  salt: { tag: "salt", type: "SALT", open: "{", close: "}", opened: /^\s*\{/ },
  json: { tag: "json", type: "JSON" },
  yaml: { tag: "yaml", type: "YAML" },
  ebnf: { tag: "ebnf", type: "EBNF" },
  regex: { tag: "regex", type: "REGEX" },
  chen: { tag: "chen", type: "CHEN_EER" },
  ditaa: { tag: "ditaa" },
  dot: { tag: "dot" },
  math: { tag: "math" },
  latex: { tag: "latex" },
  chronology: { tag: "chronology" },
};

/** Wrap a fragment in the @start/@end pair (and enclosing block) its kind needs. */
function buildSource(text, kind, meta) {
  if (/^\s*@start/m.test(text)) return { source: text.trim() + "\n", expect: meta.expect };
  const host = KIND_HOST[kind] ?? { tag: "uml" };
  const tag = meta.tag ?? host.tag;
  let inner = [meta.setup, text].filter(Boolean).join("\n");
  if (!meta.tag && host.open && !host.opened.test(inner)) inner = `${host.open}\n${inner}\n${host.close}`;
  const expect = meta.expect !== undefined ? meta.expect : meta.tag ? undefined : host.type;
  return { source: `@start${tag}\n${inner}\n@end${tag}\n`, expect };
}

function docItems(records) {
  return records
    .filter((r) => r.example !== undefined)
    .map((r) => ({
      id: `doc:${r.terms[0]}${r.kinds ? `[${r.kinds.join(",")}]` : ""}`,
      group: "docs",
      skip: r.skip,
      ...buildSource(r.example, r.kinds?.[0], r),
    }));
}

// A snippet is checked once per choice option (one choice varied at a time),
// so every text a user can produce by picking from a dropdown is validated.
function snippetItems(snippets, expandSnippetVariants) {
  return snippets.flatMap((s) => {
    const scope = Array.isArray(s.scope) ? s.scope.join(",") : s.scope;
    const kind = Array.isArray(s.scope) ? s.scope[0] : undefined;
    return expandSnippetVariants(s.body).map((text, i) => {
      const built = buildSource(text, kind, s);
      const item = { id: `snippet:${scope}:${s.prefix}${i ? `#choice${i}` : ""}`, group: i ? "snippet choice variants" : "snippets", skip: s.skip, ...built };
      if (s.scope === "top" && !s.skip && s.expect === undefined) item.problem = "starter snippet without an expected diagram type";
      return item;
    });
  });
}

const api = process.env.PLANTUML_CHECK_API ?? "http://localhost/api/v1";

// The server answers 200 with a picture of the problem in these cases, so a
// successful status alone does not mean the source produced a diagram.
const ERROR_IMAGES = [
  [/PlantUML[^<]*has crashed|An error has occured/, "PlantUML crashed while rendering"],
  [/Diagram not supported by this release/, "diagram type not supported by this PlantUML release"],
  [/Welcome to PlantUML/, "empty diagram (PlantUML rendered its welcome page)"],
];

/** Same request as checkSource in plantuml-check.mjs, but also inspects the rendered output. */
async function render(source) {
  const res = await fetch(`${api}/render/svg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = body?.detail?.error;
    return { ok: false, status: res.status, message: err?.message ?? JSON.stringify(body), line: err?.line ?? null };
  }
  const svg = await res.text();
  const errorImage = ERROR_IMAGES.find(([pattern]) => pattern.test(svg));
  if (errorImage) return { ok: false, status: 200, message: errorImage[1], line: null };
  return { ok: true, diagramType: /data-diagram-type="([^"]+)"/.exec(svg)?.[1] ?? null };
}

async function check(item) {
  if (item.problem) return { ok: false, message: item.problem };
  const key = crypto.createHash("sha256").update(`v2\n${item.source}`).digest("hex");
  const file = path.join(cacheDir, `${key}.json`);
  if (useCache && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const result = await render(item.source);
  // Transport problems are not verdicts about the source; do not cache them.
  if (result.ok || [200, 400, 422].includes(result.status)) fs.writeFileSync(file, JSON.stringify(result));
  return result;
}

const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let items = [];
try {
  const { expandSnippetVariants } = await server.ssrLoadModule(`${CORE}/snippets-model.ts`);
  if (modules.length === 0) {
    const docs = await server.ssrLoadModule(`${CORE}/docs.ts`);
    const snip = await server.ssrLoadModule(`${CORE}/snippets.ts`);
    items = [...docItems(docs.allDocRecords()), ...snippetItems(snip.snippetDefs, expandSnippetVariants)];
  } else {
    for (const file of modules) {
      const mod = await server.ssrLoadModule("/" + path.relative(root, path.resolve(file)));
      for (const value of Object.values(mod)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        if (value[0].terms) items.push(...docItems(value));
        else if (value[0].prefix) items.push(...snippetItems(value, expandSnippetVariants));
      }
    }
  }
} finally {
  await server.close();
}
if (filter) items = items.filter((i) => i.id.includes(filter));

const zero = () => ({ pass: 0, fail: 0, skip: 0 });
const counts = { docs: zero(), snippets: zero(), "snippet choice variants": zero() };
const failures = [];
let next = 0;
async function worker() {
  while (next < items.length) {
    const item = items[next++];
    if (item.skip) {
      counts[item.group].skip++;
      if (verbose) console.log(`SKIP  ${item.id}  (${item.skip})`);
      continue;
    }
    const r = await check(item);
    let error = null;
    if (!r.ok) error = `line ${r.line}: ${r.message}`;
    else if (item.expect && r.diagramType !== item.expect) error = `expected diagram type ${item.expect}, server detected ${r.diagramType}`;
    if (error) {
      counts[item.group].fail++;
      failures.push({ item, error });
    } else {
      counts[item.group].pass++;
      if (verbose) console.log(`OK    ${item.id}  [${r.diagramType}]`);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

for (const { item, error } of failures) {
  console.log(`FAIL  ${item.id}  ${error}`);
  console.log(item.source.replace(/^/gm, "      | ").trimEnd());
}
for (const [group, c] of Object.entries(counts)) {
  console.log(`${group}: ${c.pass} passed, ${c.fail} failed, ${c.skip} skipped (of ${c.pass + c.fail + c.skip})`);
}
process.exit(failures.length ? 1 : 0);
