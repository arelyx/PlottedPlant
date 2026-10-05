// Dev check for the formatter (src/lib/plantuml-language/core/format.ts): ask a real
// PlantUML server whether formatting changes anything it cares about.
//
//   node scripts/authoring-format-oracle.mjs [--deindent] [--tabs] [dir-or-file ...]
//
// For every .puml file (default: the test corpus) and every @start…/@end… block in it:
//   1. format the file; it must be idempotent and change whitespace only;
//   2. the formatted block must still parse, as the same diagram type (checkSource);
//   3. the formatted block must render to the same SVG as the original.
// With --deindent every line first loses its leading whitespace, and the formatter is
// compared against that flattened source: whatever the input looks like, formatting
// must not change what it means. Files with a block whose indentation is syntax
// (mindmap, WBS, Gantt, YAML, ditaa, …) are skipped in that mode, since flattening
// them is itself a change of meaning.
//   PLANTUML_CHECK_API=http://localhost/api/v1 (default)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { build } from "esbuild";
import { checkSource } from "./plantuml-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const api = process.env.PLANTUML_CHECK_API ?? "http://localhost/api/v1";
const args = process.argv.slice(2);
const deindent = args.includes("--deindent");
const options = args.includes("--tabs") ? { tabSize: 4, insertSpaces: false } : { tabSize: 2, insertSpaces: true };
const targets = args.filter((arg) => !arg.startsWith("--"));
if (targets.length === 0) targets.push(path.join(here, "../src/lib/plantuml-language/__tests__/corpus"));

async function loadCore() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "plantuml-format-"));
  const entry = (name) => path.join(here, `../src/lib/plantuml-language/core/${name}.ts`);
  await build({
    entryPoints: [entry("format"), entry("structure")],
    bundle: true,
    format: "esm",
    outdir,
    outExtension: { ".js": ".mjs" },
    loader: { ".json": "json" },
    logLevel: "silent",
  });
  const load = (name) => import(pathToFileURL(path.join(outdir, `${name}.mjs`)).href);
  const [{ formatText }, { analyzeStructure }] = await Promise.all([load("format"), load("structure")]);
  fs.rmSync(outdir, { recursive: true, force: true });
  return { formatText, analyzeStructure };
}

/** SVG with what legitimately differs between two renders removed: embedded source, line numbers, ids hashed from the source. */
async function renderNormalised(source) {
  const res = await fetch(`${api}/render/svg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) return null;
  return (await res.text())
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?plantuml[\s\S]*?\?>/g, "")
    .replace(/(?:codeLine|data-source-line)="\d+"/g, "")
    .replace(/url\(#[^)]+\)/g, "url(#ID)")
    .replace(/(<(?:filter|linearGradient|radialGradient|clipPath|pattern|mask)\b[^>]*?)\sid="[^"]*"/g, "$1");
}

const blocksOf = (text) => text.match(/^[ \t]*@start[\s\S]*?^[ \t]*@end\w*[ \t]*$/gm) ?? [text];
const nonWhitespace = (text) => text.replace(/\s+/g, "");
const INDENT_IS_SYNTAX = new Set(["tree", "lines", "opaque"]);

const files = targets.flatMap((target) =>
  fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((f) => f.endsWith(".puml")).sort().map((f) => path.join(target, f))
    : [target],
);
const { formatText, analyzeStructure } = await loadCore();
const stats = { files: 0, skipped: 0, unchanged: 0, blocks: 0, sameRender: 0, invalidInput: 0 };
const failures = [];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  stats.files++;
  if (deindent) {
    const lines = source.split(/\r\n|\n/);
    if (analyzeStructure(lines).blocks.some((block) => INDENT_IS_SYNTAX.has(block.dialect))) {
      stats.skipped++;
      continue;
    }
    source = lines.map((line) => line.replace(/^[ \t]+/, "")).join("\n");
  }
  const formatted = formatText(source, options);
  if (formatText(formatted, options) !== formatted) failures.push(`${file}: not idempotent`);
  if (nonWhitespace(formatted) !== nonWhitespace(source)) failures.push(`${file}: changed more than whitespace`);
  if (formatted === source) {
    stats.unchanged++;
    continue;
  }
  const [before, after] = [blocksOf(source), blocksOf(formatted)];
  if (before.length !== after.length) {
    failures.push(`${file}: block count changed`);
    continue;
  }
  for (const [index, block] of before.entries()) {
    if (block === after[index]) continue;
    stats.blocks++;
    const [was, now] = [await checkSource(block), await checkSource(after[index])];
    if (!was.ok) {
      // Only reachable with --deindent, when flattening already broke the input.
      stats.invalidInput++;
      continue;
    }
    if (!now.ok) failures.push(`${file} block ${index + 1}: no longer parses (line ${now.line}: ${now.message})`);
    else if (now.diagramType !== was.diagramType) failures.push(`${file} block ${index + 1}: ${was.diagramType} became ${now.diagramType}`);
    else if ((await renderNormalised(block)) !== (await renderNormalised(after[index]))) failures.push(`${file} block ${index + 1}: renders differently`);
    else stats.sameRender++;
  }
}

console.log(
  `${stats.files} files (${stats.skipped} skipped, ${stats.unchanged} already formatted); ` +
    `${stats.blocks} reformatted blocks: ${stats.sameRender} render identically, ` +
    `${stats.invalidInput} had invalid input, ${failures.length} failures`,
);
for (const failure of failures) console.log(`FAIL  ${failure}`);
process.exit(failures.length ? 1 : 0);
