import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { foldingRanges } from "../core/folding";

const corpusDir = path.join(__dirname, "corpus");
const corpus = (file: string) => fs.readFileSync(path.join(corpusDir, file), "utf8").replace(/\r\n/g, "\n").split("\n");

/** Ranges as `start-end` in 1-based lines, as an editor shows them. */
const fold = (source: string | string[]) =>
  foldingRanges(typeof source === "string" ? source.split("\n") : source).map(
    (r) => `${r.startLine + 1}-${r.endLine + 1}${r.kind ? ` ${r.kind}` : ""}`,
  );

describe("folding ranges", () => {
  it("folds a diagram block and keeps its @end line visible", () => {
    expect(fold("@startuml\nA -> B\nB -> A\n@enduml")).toEqual(["1-3 region"]);
  });

  it("folds each branch of a construct separately", () => {
    expect(fold("@startuml\nalt a\nA -> B\nA -> B\nelse b\nB -> A\nB -> A\nend\n@enduml")).toEqual(["1-8 region", "2-4", "5-7"]);
  });

  it("folds nested constructs, notes and brace blocks", () => {
    expect(
      fold("@startuml\npackage P {\nclass A {\n+f()\n+g()\n}\nnote left of A\nline 1\nline 2\nend note\n}\n@enduml"),
    ).toEqual(["1-11 region", "2-10", "3-5", "7-9"]);
  });

  it("folds a multi-line label including its last line, which is text", () => {
    expect(fold("@startuml\nstart\n:first\nsecond\nthird;\nstop\n@enduml")).toEqual(["1-6 region", "3-5"]);
  });

  it("folds block comments and runs of line comments", () => {
    expect(fold("@startuml\n/' a\nb\n'/\n' one\n' two\n' three\nA -> B\n' alone\n@enduml")).toEqual([
      "1-9 region",
      "2-4 comment",
      "5-7 comment",
    ]);
  });

  it("folds preprocessor blocks and the braces inside style and skinparam bodies", () => {
    expect(
      fold("@startuml\n!if (1)\nA -> B\n!else\nB -> A\n!endif\n<style>\nnote {\nFontSize 1\nFontColor red\n}\n</style>\nskinparam class {\nA 1\nB 2\n}\n@enduml"),
    ).toEqual(["1-16 region", "2-3", "4-5", "7-11", "8-10", "13-15"]);
  });

  it("folds mindmap subtrees by marker depth", () => {
    expect(fold("@startmindmap\n* root\n** a\n*** a1\n*** a2\n** b\n*** b1\n** c\n@endmindmap")).toEqual([
      "1-8 region",
      "2-8",
      "3-5",
      "6-7",
    ]);
  });

  it("folds WBS and indentation-style trees, and arithmetic markers", () => {
    expect(fold("@startwbs\n* root\n * a\n  * a1\n * b\n@endwbs")).toEqual(["1-5 region", "2-5", "3-4"]);
    expect(fold("@startmindmap\n+ root\n++ right\n+++ r1\n-- left\n--- l1\n@endmindmap")).toEqual([
      "1-6 region",
      "2-6",
      "3-4",
      "5-6",
    ]);
  });

  it("keeps a multi-line mindmap node inside its parent's fold", () => {
    expect(fold("@startmindmap\n* root\n**:two\n* not a node\nlines;\n*** child\n** next\n@endmindmap")).toEqual([
      "1-7 region",
      "2-7",
      "3-6",
    ]);
  });

  it("folds JSON and Salt brackets that span lines", () => {
    expect(fold('@startjson\n{\n"a": [\n1,\n2\n],\n"b": {"c": 1}\n}\n@endjson')).toEqual(["1-8 region", "2-7", "3-5"]);
    expect(fold("@startsalt\n{\n{T\n+ a\n++ b\n}\n}\n@endsalt")).toEqual(["1-7 region", "2-6", "3-5"]);
  });

  it("does not fold constructs that are never closed", () => {
    expect(fold("@startuml\nalt x\nA -> B\n@enduml")).toEqual(["1-3 region"]);
  });

  it("folds an unterminated block up to its last line of content", () => {
    expect(fold("@startuml\nA -> B\nB -> A\n\n")).toEqual(["1-3 region"]);
  });

  it("gives every nesting level of a deeply nested corpus diagram its own range", () => {
    const ranges = fold(corpus("authoring-sequence-deep-nesting.puml"));
    // alt … else, loop, opt, the two halves of par, and the ref body.
    for (const range of ["13-37", "15-29", "17-23", "19-20", "21-22", "43-45"]) expect(ranges).toContain(range);
  });

  it("produces well-formed ranges for the whole corpus", () => {
    for (const file of fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml"))) {
      const lines = corpus(file);
      for (const range of foldingRanges(lines)) {
        expect(range.endLine, file).toBeGreaterThan(range.startLine);
        expect(range.endLine, file).toBeLessThan(lines.length);
      }
    }
  });
});
