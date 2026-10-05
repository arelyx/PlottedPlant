import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { detectUmlKind, parseBlocks } from "../core/blocks";
import type { DiagramKind } from "../core/types";

const corpusDir = path.join(__dirname, "corpus");
const fixturePath = path.join(__dirname, "blocks-oracle-kinds.json");

/**
 * The diagram type the real PlantUML engine reported for each corpus file
 * (first block only; null where it reports none, e.g. ditaa). Regenerate with
 *   UPDATE_ORACLE_KINDS=1 npx vitest run blocks-kinds
 * while the rendering stack is up.
 */
const oracle: Record<string, string | null> = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

/** Engine diagram types mapped onto the kinds this service distinguishes. */
const ENGINE_KINDS: Record<string, DiagramKind[]> = {
  SEQUENCE: ["sequence"],
  CLASS: ["class", "object", "er"],
  ACTIVITY: ["activity", "activity-legacy"],
  STATE: ["state"],
  DESCRIPTION: ["usecase", "component", "deployment", "archimate"],
  TIMING: ["timing"],
  GANTT: ["gantt"],
  MINDMAP: ["mindmap"],
  WBS: ["wbs"],
  SALT: ["salt"],
  JSON: ["json"],
  YAML: ["yaml"],
  NWDIAG: ["nwdiag"],
  EBNF: ["ebnf"],
  REGEX: ["regex"],
  CHEN_EER: ["chen"],
};

const corpusFiles = fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml")).sort();

describe("diagram kind detection", () => {
  it.runIf(process.env.UPDATE_ORACLE_KINDS)("refreshes the oracle fixture", async () => {
    const scriptPath = path.join(__dirname, "../../../../scripts/plantuml-check.mjs");
    const { checkSource } = (await import(/* @vite-ignore */ scriptPath)) as {
      checkSource: (source: string) => Promise<{ ok: boolean; diagramType?: string | null }>;
    };
    const next: Record<string, string | null> = {};
    for (const file of corpusFiles) {
      const result = await checkSource(fs.readFileSync(path.join(corpusDir, file), "utf8"));
      if (result.ok) next[file] = result.diagramType ?? null;
    }
    fs.writeFileSync(fixturePath, JSON.stringify(next, null, 2) + "\n");
  }, 120_000);

  it("agrees with the PlantUML engine on every corpus file", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const file of corpusFiles) {
      const engineType = oracle[file];
      const accepted = engineType ? ENGINE_KINDS[engineType] : undefined;
      if (!accepted) continue;
      const lines = fs.readFileSync(path.join(corpusDir, file), "utf8").split(/\r?\n/);
      const first = parseBlocks(lines)[0];
      compared++;
      if (!first || !accepted.includes(first.kind)) mismatches.push(`${file}: engine ${engineType}, detected ${first?.kind}`);
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(60);
  });

  it("distinguishes the sub-kinds PlantUML lumps together", () => {
    const kindOf = (name: string) =>
      parseBlocks(fs.readFileSync(path.join(corpusDir, name), "utf8").split(/\r?\n/))[0].kind;
    expect(kindOf("intel-usecase.puml")).toBe("usecase");
    expect(kindOf("intel-component.puml")).toBe("component");
    expect(kindOf("intel-deployment.puml")).toBe("deployment");
    expect(kindOf("intel-archimate.puml")).toBe("archimate");
    expect(kindOf("intel-er-entity.puml")).toBe("er");
    expect(kindOf("intel-object-map-json.puml")).toBe("object");
    expect(kindOf("intel-activity-legacy.puml")).toBe("activity-legacy");
    expect(kindOf("intel-activity-new.puml")).toBe("activity");
    expect(kindOf("intel-class-full.puml")).toBe("class");
  });

  it("detects sub-diagrams embedded in @startuml", () => {
    expect(detectUmlKind(["salt", "{", "  [OK]", "}"])).toBe("salt");
    expect(detectUmlKind(["nwdiag {", "  network dmz {", "    web01;", "  }", "}"])).toBe("nwdiag");
    expect(detectUmlKind(["[Design] lasts 5 days", "[Build] starts at [Design]'s end"])).toBe("gantt");
  });

  it("handles text before the first block, several blocks and unclosed blocks", () => {
    const lines = fs.readFileSync(path.join(corpusDir, "intel-multi-block.puml"), "utf8").split(/\r?\n/);
    expect(parseBlocks(lines).map((b) => [b.tag, b.kind, b.closed])).toEqual([
      ["uml", "sequence", true],
      ["uml", "class", true],
      ["mindmap", "mindmap", true],
    ]);
    expect(parseBlocks(["@startuml", "class A {", "  +x: int"])).toEqual([
      { tag: "uml", kind: "class", startLine: 0, endLine: 2, closed: false },
    ]);
    expect(parseBlocks(["@startuml", "@enduml"])[0].kind).toBe("unknown");
    expect(parseBlocks(["no diagram here"])).toEqual([]);
  });

  it("is not fooled by arrows inside notes and labels", () => {
    expect(detectUmlKind(["class A", "note right of A", "  Alice -> Bob: activate", "  participant X", "end note"])).toBe("class");
    expect(detectUmlKind(["state S", "S : class Foo is mentioned here"])).toBe("state");
  });
});
