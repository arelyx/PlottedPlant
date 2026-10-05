import { describe, expect, it } from "vitest";
import { plantumlLanguage } from "../../plantuml-lang";

/** Highlighted pieces of `source` as "text‹token›", from the CodeMirror stream tokenizer. */
function highlight(source: string): string[] {
  const out: string[] = [];
  plantumlLanguage.parser.parse(source).iterate({
    enter(node) {
      if (node.from < node.to && node.name !== "Document") out.push(`${source.slice(node.from, node.to)}‹${node.name}›`);
    },
  });
  return out;
}

describe("CodeMirror highlighting (version diff and preview dialogs)", () => {
  it("highlights tags, types, keywords, arrows, colours and strings", () => {
    expect(highlight('@startuml\nparticipant "Web App" as W #LightBlue\nW -> DB: query\n@enduml')).toEqual([
      "@startuml‹keyword›",
      "participant‹typeName›",
      '"Web App"‹string›',
      "as‹keyword›",
      "#LightBlue‹number›",
      "->‹operator›",
      "@enduml‹keyword›",
    ]);
  });

  it("knows every @start tag in PlantUML's vocabulary", () => {
    for (const tag of ["mindmap", "gantt", "salt", "json", "yaml", "wbs", "chen", "ebnf", "regex", "nwdiag", "ditaa"]) {
      expect(highlight(`@start${tag}\n@end${tag}`)).toEqual([`@start${tag}‹keyword›`, `@end${tag}‹keyword›`]);
    }
  });

  it("spans block comments over lines and only starts line comments at line start", () => {
    expect(highlight("/' one\ntwo '/\nclass A\n' note\nA -> B: it's fine")).toEqual([
      "/' one‹comment›",
      "two '/‹comment›",
      "class‹typeName›",
      "' note‹comment›",
      "->‹operator›",
    ]);
  });

  it("leaves message text alone", () => {
    expect(highlight("Alice -> Bob: start the loop and end --> here")).toEqual(["->‹operator›"]);
  });

  it("highlights preprocessor lines and variables", () => {
    expect(highlight('!include <C4/C4>\n!$x = 1\nrectangle $x')).toContain("!include‹meta›");
    expect(highlight("rectangle $x")).toEqual(["rectangle‹typeName›", "$x‹meta›"]);
  });

  it("recognises class and crow's-foot relations as single arrows", () => {
    for (const arrow of ["<|--", "*--", "o--", "..>", "--|>", "}o--||", "||--o{", "-[#red]->"]) {
      expect(highlight(`A ${arrow} B`)).toEqual([`${arrow}‹operator›`]);
    }
  });
});
