// Regenerates src/lib/plantuml-language/data/vocab.generated.json from a
// PlantUML server's own word lists, so completion and highlighting match the
// engine that renders the diagrams.
//
//   node scripts/generate-plantuml-vocab.mjs scripts/data/plantuml-server-dump.json
//
// <dump.json> is {"language": <GET /language>, "themes": <GET /ui-helper?request=themes>,
// "icons": <...=icons>, "emojis": <...=emojis>} with each value the raw response body.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const [dumpPath] = process.argv.slice(2);
if (!dumpPath) {
  console.error("usage: generate-plantuml-vocab.mjs <dump.json>");
  process.exit(1);
}
const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));

// `/language` is a list of sections: ";name", ";count", then one word per line.
const sections = {};
let current = null;
for (const line of dump.language.split(/\r?\n/)) {
  if (line.startsWith(";")) {
    const name = line.slice(1);
    if (name === "EOF") break;
    if (/^\d+$/.test(name)) continue;
    current = sections[name] = [];
  } else if (line && current) {
    current.push(line);
  }
}

const keywords = sections.keyword ?? [];
const vocab = {
  types: sections.type ?? [],
  startTags: keywords.filter((k) => k.startsWith("@start")).map((k) => k.slice(6)),
  keywords: keywords.filter((k) => !k.startsWith("@")),
  preprocessor: (sections.preprocessor ?? []).map((p) => p.replace(/^!/, "")),
  skinparams: sections.skinparameter ?? [],
  colors: sections.color ?? [],
  themes: JSON.parse(dump.themes).filter((t) => t !== "_none_"),
  icons: JSON.parse(dump.icons),
  emojis: JSON.parse(dump.emojis)
    .map(([, name]) => name)
    .filter(Boolean),
};

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/plantuml-language/data/vocab.generated.json",
);
fs.writeFileSync(out, JSON.stringify(vocab) + "\n");
console.log(
  Object.entries(vocab)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(", "),
);
