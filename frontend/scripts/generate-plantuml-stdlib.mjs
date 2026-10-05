// Build-time extraction of standard-library macro signatures for editor
// completion and signature help. Only names and parameter lists are kept
// (facts about the C4-PlantUML API, MIT licensed); no library code is copied.
//
//   node scripts/generate-plantuml-stdlib.mjs path/to/c4.min.js
//
// The input is the stdlib bundle PlantUML publishes for its JavaScript build:
// it assigns window.PLANTUML_STDLIB[<lib>] = { <file>: <lines> }.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/generate-plantuml-stdlib.mjs path/to/c4.min.js");
  process.exit(1);
}
const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/plantuml-language/data/stdlib-c4.generated.json");

const window = {};
vm.runInNewContext(fs.readFileSync(input, "utf8"), { window });
const files = window.PLANTUML_STDLIB?.c4;
const info = window.PLANTUML_STDLIB_INFO?.c4;
if (!files) throw new Error("no window.PLANTUML_STDLIB.c4 in " + input);

/** c4_container -> C4_Container, the spelling used in `!include <C4/C4_Container>`. */
const publicName = (file) => file.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join("_");

function splitParams(source) {
  const out = [];
  let depth = 0;
  let quote = false;
  let current = "";
  for (const ch of source) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && depth === 0 && ch === ",") {
      out.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((part) => {
    const [name, ...rest] = part.split("=");
    return { name: name.trim().replace(/^\$/, ""), optional: rest.length > 0 };
  });
}

const DEFINITION = /^\s*!(?:unquoted\s+)?(?:procedure|function)\s+([A-Za-z]\w*)\s*\((.*)\)\s*$/;
const INCLUDE = /^\s*!include\s+<?(?:C4\/)?(C4(?:_\w+)?)(?:\.puml)?>?\s*$/i;

const out = { library: info?.name ?? "C4", version: info?.version ?? "", files: {} };
for (const [file, content] of Object.entries(files)) {
  if (file.includes("/")) continue; // themes and examples define no macros
  const lines = Array.isArray(content) ? content : String(content).split("\n");
  const macros = new Map();
  const includes = new Set();
  for (const line of lines) {
    const include = INCLUDE.exec(line);
    if (include) includes.add(publicName(include[1].toLowerCase()));
    const definition = DEFINITION.exec(line);
    // Names starting with "$" are the library's internals; skip them.
    if (definition && !macros.has(definition[1])) macros.set(definition[1], splitParams(definition[2]));
  }
  out.files[publicName(file)] = {
    includes: [...includes].filter((name) => name !== publicName(file)),
    macros: [...macros].map(([name, params]) => ({ name, params })),
  };
}
fs.writeFileSync(outFile, JSON.stringify(out) + "\n");
const total = Object.values(out.files).reduce((n, f) => n + f.macros.length, 0);
console.log(`wrote ${path.relative(process.cwd(), outFile)}: ${Object.keys(out.files).length} files, ${total} macros (${out.library} ${out.version})`);
