// Dev helper: ask a real PlantUML server (through the app's render API)
// whether sources are valid, and what diagram type it detected.
//
//   node scripts/plantuml-check.mjs file1.puml [file2.puml ...]
//   PLANTUML_CHECK_API=http://localhost/api/v1 (default)
import fs from "fs";

const api = process.env.PLANTUML_CHECK_API ?? "http://localhost/api/v1";

const FALSE_PASSES = [
  [/PlantUML[^<]*has crashed|An error has occured/, "PlantUML crashed while rendering"],
  [/Diagram not supported by this release/, "diagram type not supported by this PlantUML release"],
  [/Welcome to PlantUML/, "empty diagram (PlantUML rendered its welcome page)"],
];

export async function checkSource(source) {
  const res = await fetch(`${api}/render/svg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (res.ok) {
    const svg = await res.text();
    // Some failures still come back as HTTP 200 with an explanatory image.
    for (const [pattern, message] of FALSE_PASSES) {
      if (pattern.test(svg)) return { ok: false, status: res.status, message, line: null };
    }
    return { ok: true, diagramType: /data-diagram-type="([^"]+)"/.exec(svg)?.[1] ?? null };
  }
  const body = await res.json().catch(() => null);
  const err = body?.detail?.error;
  return { ok: false, status: res.status, message: err?.message ?? JSON.stringify(body), line: err?.line ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  for (const file of process.argv.slice(2)) {
    const r = await checkSource(fs.readFileSync(file, "utf8"));
    if (!r.ok) failed++;
    console.log(r.ok ? `OK    ${file}  [${r.diagramType}]` : `FAIL  ${file}  line ${r.line}: ${r.message}`);
  }
  process.exit(failed ? 1 : 0);
}
