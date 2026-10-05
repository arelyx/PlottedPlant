import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { computeDiagnostics, editDistance, suggestSkinparam, type Diagnostic } from "../core/diagnostics";
import { contentColumns, describeEngineError } from "../core/engine-error";
import { applyEdits } from "../core/format";

const corpusDir = path.join(__dirname, "corpus");
const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml"));

const lint = (source: string, cursorLine?: number) => computeDiagnostics(source.split("\n"), { cursorLine });
const uml = (body: string, cursorLine?: number) => lint(`@startuml\n${body}\n@enduml`, cursorLine);
/** `code severity line:start-end "flagged text"`, 1-based line, 0-based columns. */
const describeAll = (source: string, diagnostics: Diagnostic[]) =>
  diagnostics.map((d) => {
    const text = source.split("\n")[d.range.startLine].slice(d.range.startColumn, d.range.endColumn);
    return `${d.code} ${d.severity} ${d.range.startLine + 1}:${d.range.startColumn}-${d.range.endColumn} "${text}"`;
  });
/** Apply the first quick fix of the first diagnostic with the given code. */
const fix = (source: string, code: string, cursorLine?: number) => {
  const diagnostic = lint(source, cursorLine).find((d) => d.code === code);
  if (!diagnostic || diagnostic.fixes.length === 0) return null;
  return applyEdits(source.split("\n"), diagnostic.fixes[0].edits).join("\n");
};

describe("no false positives", () => {
  // Every corpus file renders on a real PlantUML server; none may be flagged.
  it.each(files)("%s has no diagnostics", (file) => {
    const source = fs.readFileSync(path.join(corpusDir, file), "utf8").replace(/\r\n/g, "\n");
    expect(describeAll(source, lint(source))).toEqual([]);
  });

  it("accepts valid input that resembles each kind of mistake", () => {
    const valid = [
      // Skinparams the engine accepts although its own list omits them.
      "skinparam ArrowColor red\nskinparam packageBackgroundColor #EEE\nskinparam stereotypeCBackgroundColor Wheat\nskinparam sequenceGroupHeaderFontColor blue\nskinparam nodesep 10\nskinparam useBetaStyle true\nskinparam lifelineStrategy solid\nskinparam actorStyle awesome\nskinparam StereotypeAlignment right\nskinparam classBackgroundColor<<Foo>> red\nskinparam sequenceMessageAlign center",
      "skinparam class {\n  BackgroundColor<<Entity>> Wheat\n  ArrowColor Navy\n  Font {\n    Color black\n    Size 12\n  }\n}",
      "!$name = \"classFontColor\"\nskinparam $name red\nclass A",
      // Colours: hex forms, names in any case, gradients, specials, inline styles, variables.
      "participant A #F00\nparticipant B #ff000080\nparticipant C #LIGHTBLUE\nparticipant D #red/blue\nparticipant E #transparent\nA -[#green,dashed]> B\nC -[#00FF00]-> D : #notacolour\nnote over A #FFAAAA: text",
      "class A #line:red;back:LightYellow;text:blue\nclass B ##[dashed]green\n!$accent = \"red\"\nclass C #$accent\nA : #protectedField\nA : #reed()\nclass D {\n  #secret\n  #gren()\n}",
      "!define MyBlue #6192d1\nskinparam class {\n  BackgroundColor white\\MyBlue\n}\nclass X",
      "title Issue #1234 and #reed\nA -> B : see #lightgren\n== Phase #2 ==\nnote left: #blak\nA -> B",
      // Themes and directives.
      "!theme plain\n!$name = \"plain\"\n!theme $name\nA -> B",
      "!$x = 1\n!global $z = 2\n!x = 3\n!pragma teoz true\n!assert %true()\n!log hello\n!procedure $p()\n  !local $y = 2\n!endprocedure\n!undef x\nA -> B",
      // Structure.
      "class A {\n  member\n}\nnote left of A::member\n  body\nend note",
      "A -> B\nnote right #pink;line:red\n  end\n  else\nend note",
    ];
    for (const body of valid) expect(describeAll(`@startuml\n${body}\n@enduml`, uml(body)), body).toEqual([]);
  });

  it("accepts directives that only work with file access", () => {
    // The oracle runs sandboxed, so these cannot be render-checked; the engine's own patterns accept them.
    expect(uml("!include_many foo.puml\n!includeurl http://example.com/x.puml\n!theme mine from /some/path\n!dump_memory\nA -> B")).toEqual([]);
  });

  it("stays quiet where it cannot be sure", () => {
    // A macro that opens a block, branches that differ, files from outside: no structural claims.
    expect(uml("!definelong OPEN(n)\npackage n {\n!enddefinelong\nOPEN(a)\nclass B\n}")).toEqual([]);
    expect(uml("!if (1)\npackage A {\n!endif\nclass B\n}")).toEqual([]);
    expect(uml("!include parts.iuml\nclass B\n}\nend")).toEqual([]);
  });
});

describe("@start / @end pairing", () => {
  it.each<[string, string, string[]]>([
    ["missing @end", "@startuml\nA -> B\n", ['missing-end-tag warning 1:0-9 "@startuml"']],
    ["mismatched tag", "@startmindmap\n* a\n@enduml", ['mismatched-end-tag info 3:0-7 "@enduml"']],
    ["stray @end", "@enduml\n@startuml\nA -> B\n@enduml", ['stray-end-tag warning 1:0-7 "@enduml"']],
    ["nested @start", "@startuml\nA -> B\n  @startuml\nB -> A\n@enduml", ['nested-start-tag warning 3:2-11 "@startuml"']],
    [
      "content after the last @end",
      "@startuml\nA -> B\n@enduml\n\n  leftover text  \n' a comment is fine\n",
      ['content-after-end hint 5:2-15 "leftover text"'],
    ],
  ])("%s", (_name, source, expected) => {
    expect(describeAll(source, lint(source))).toEqual(expected);
  });

  it("explains each problem", () => {
    expect(lint("@startuml\nA -> B")[0].message).toBe('"@startuml" is never closed with "@enduml".');
    expect(lint("@startmindmap\n* a\n@enduml")[0].message).toBe(
      '"@enduml" closes a block opened with "@startmindmap"; "@endmindmap" is expected.',
    );
    expect(lint("@startuml\nA -> B\n@startjson\n{}\n@endjson")[0].message).toBe(
      '"@startjson" begins before the "@startuml" block on line 1 is closed with "@enduml".',
    );
    expect(lint("@endwbs")[0].message).toBe('"@endwbs" has no matching "@startwbs".');
  });

  it("fixes them", () => {
    expect(fix("@startuml\nA -> B\n\n", "missing-end-tag")).toBe("@startuml\nA -> B\n@enduml\n\n");
    expect(fix("@startgantt\n[a] lasts 1 day", "missing-end-tag")).toBe("@startgantt\n[a] lasts 1 day\n@endgantt");
    expect(fix("@startmindmap\n* a\n@enduml", "mismatched-end-tag")).toBe("@startmindmap\n* a\n@endmindmap");
    expect(fix("@startuml\nA -> B\n\n@startuml\nB -> A\n@enduml", "nested-start-tag")).toBe(
      "@startuml\nA -> B\n@enduml\n\n@startuml\nB -> A\n@enduml",
    );
    expect(fix("@startuml\nA -> B\n@enduml\n@enduml", "stray-end-tag")).toBe("@startuml\nA -> B\n@enduml");
  });
});

describe("unclosed and stray constructs", () => {
  it.each<[string, string, string[]]>([
    ["unclosed alt", "alt x\n  A -> B", ['unclosed-block warning 2:0-3 "alt"']],
    ["unclosed nested loop", "alt x\n  loop\n  A -> B\nend", ['unclosed-block warning 2:0-3 "alt"']],
    ["unclosed if", "start\n  if (x) then\n  :a;\nstop", ['unclosed-block warning 3:2-4 "if"']],
    ["unclosed while inside partition", "start\npartition P {\n  while (x)\n  :a;\n}\nstop", ['unclosed-block warning 4:2-7 "while"']],
    ["unclosed brace", "package P {\n  class A", ['unclosed-block warning 2:0-7 "package"']],
    ["unclosed class body", "class A {\n  f", ['unclosed-block warning 2:0-5 "class"']],
    ["unclosed note", "A -> B\nnote left\n  text", ['unclosed-block warning 3:0-4 "note"']],
    ["unclosed block comment", "A -> B\n/' open", ['unclosed-block warning 3:0-2 "/\'"']],
    ["unclosed !if", "!if (1)\nA -> B", ['unclosed-block warning 2:0-3 "!if"']],
    ["unclosed !procedure", "!procedure $p()\nA -> B", ['unclosed-block warning 2:0-10 "!procedure"']],
    ["unclosed style", "<style>\nnote {\n}", ['unclosed-block warning 2:0-7 "<style>"']],
    ["stray end", "A -> B\nend", ['stray-closer warning 3:0-3 "end"']],
    ["stray brace", "class A\n  }", ['stray-closer warning 3:2-3 "}"']],
    ["stray endif", "start\nendif\nstop", ['stray-closer warning 3:0-5 "endif"']],
    ["stray !endif", "A -> B\n!endif", ['stray-closer warning 3:0-6 "!endif"']],
    ["else outside alt", "A -> B\nelse x", ['stray-branch warning 3:0-4 "else"']],
    ["elseif outside if", "start\nelseif (x) then\nstop", ['stray-branch warning 3:0-6 "elseif"']],
  ])("%s", (_name, body, expected) => {
    const source = `@startuml\n${body}\n@enduml`;
    expect(describeAll(source, uml(body))).toEqual(expected);
  });

  it("names what is expected", () => {
    expect(uml("alt x")[0].message).toBe('"alt" opened here is never closed with "end".');
    expect(uml("start\nif (x) then\nstop")[0].message).toBe('"if" opened here is never closed with "endif".');
    expect(uml("A -> B\nnote left\nx")[0].message).toBe('"note" opened here is never closed with "end note".');
    expect(uml("A -> B\nend")[0].message).toBe(
      '"end" does not close anything: there is no open alt, opt, loop, par, break, critical or group before it.',
    );
    expect(uml("A -> B\nelse")[0].message).toBe('"else" is outside any "alt" block.');
  });

  it("reports the construct being typed at the cursor as a hint, and outer ones as warnings", () => {
    const body = "alt x\n  loop\n    A -> B";
    expect(uml(body, 3).map((d) => `${d.range.startLine}:${d.severity}`)).toEqual(["1:warning", "2:hint"]);
    expect(uml(body).map((d) => d.severity)).toEqual(["warning", "warning"]);
    // The cursor in another diagram does not soften anything.
    expect(lint(`@startuml\n${body}\n@enduml\n@startuml\nA -> B\n@enduml`, 6).map((d) => d.severity)).toEqual(["warning", "warning"]);
  });

  it("inserts the missing closer at the opener's indentation, where the construct has to end", () => {
    expect(fix("@startuml\n  alt x\n    A -> B\n\n@enduml", "unclosed-block")).toBe("@startuml\n  alt x\n    A -> B\n  end\n\n@enduml");
    expect(fix("@startuml\nstart\npartition P {\n  if (x) then\n    :a;\n}\nstop\n@enduml", "unclosed-block")).toBe(
      "@startuml\nstart\npartition P {\n  if (x) then\n    :a;\n  endif\n}\nstop\n@enduml",
    );
    expect(fix("@startuml\npackage P {\n  class A\n@enduml", "unclosed-block")).toBe("@startuml\npackage P {\n  class A\n}\n@enduml");
    expect(fix("@startuml\n!if (1)\nA -> B\n@enduml", "unclosed-block")).toBe("@startuml\n!if (1)\nA -> B\n!endif\n@enduml");
  });

  it("closes a text body after its first paragraph, since the rest was swallowed by it", () => {
    expect(fix("@startuml\nA -> B\nnote left\n  one\n  two\n\nB -> A\n@enduml", "unclosed-block")).toBe(
      "@startuml\nA -> B\nnote left\n  one\n  two\nend note\n\nB -> A\n@enduml",
    );
  });

  it("removes a stray closer", () => {
    expect(fix("@startuml\nA -> B\nend\n@enduml", "stray-closer")).toBe("@startuml\nA -> B\n@enduml");
  });
});

describe("skinparam names", () => {
  it.each<[string, string | undefined]>([
    ["backgroundColour", "backgroundColor"],
    ["BackgroundColr", "BackgroundColor"],
    ["classBackgroundColr", "classBackgroundColor"],
    ["ClasBackgroundColor", "ClassBackgroundColor"],
    ["sequenceMesageAlign", "sequenceMessageAlignment"],
    ["defaultFontNmae", "defaultFontName"],
    ["handwriten", "handwritten"],
    ["shadowng", "shadowing"],
    ["MaxMesageSize", "MaxMessageSize"],
    // Valid, listed or composed from an element and a property.
    ["BackgroundColor", undefined],
    ["BACKGROUNDCOLOR", undefined],
    ["class_background.color", undefined],
    ["ArrowColor", undefined],
    ["rectangleRoundCorner", undefined],
    ["SequenceParticipantBorderThickness", undefined],
    // Unlike anything known: might be valid, the engine's list is incomplete.
    ["svek", undefined],
    ["fooBarBaz", undefined],
    ["$variable", undefined],
  ])("%s → %s", (name, suggestion) => {
    expect(suggestSkinparam(name)).toBe(suggestion);
  });

  it("flags a misspelt name with a suggestion and the exact range", () => {
    const body = "skinparam backgroundColour #EEE\n  skinparam   classBackgroundColr<<Entity>> red";
    const source = `@startuml\n${body}\n@enduml`;
    expect(describeAll(source, uml(body))).toEqual([
      'unknown-skinparam warning 2:10-26 "backgroundColour"',
      'unknown-skinparam warning 3:14-33 "classBackgroundColr"',
    ]);
    expect(uml(body)[0].message).toBe(
      'Unknown skinparam "backgroundColour" (PlantUML ignores it). Did you mean "backgroundColor"?',
    );
    expect(fix(source, "unknown-skinparam")).toBe(
      "@startuml\nskinparam backgroundColor #EEE\n  skinparam   classBackgroundColr<<Entity>> red\n@enduml",
    );
  });

  it("composes names inside skinparam blocks", () => {
    const source = "@startuml\nskinparam class {\n  BackgroundColr red\n  BorderColor blue\n  Font {\n    Colr black\n  }\n}\n@enduml";
    const diagnostics = lint(source);
    expect(describeAll(source, diagnostics)).toEqual([
      'unknown-skinparam warning 3:2-16 "BackgroundColr"',
      'unknown-skinparam warning 6:4-8 "Colr"',
    ]);
    expect(diagnostics[0].message).toContain('"classBackgroundColr"');
    expect(diagnostics[1].message).toContain('Did you mean "classFontColor"');
    expect(fix(source, "unknown-skinparam")).toBe(source.replace("BackgroundColr", "BackgroundColor"));
  });

  it("ignores skinparam-looking text in notes and comments", () => {
    expect(uml("note left\n  skinparam backgroundColour red\nend note\n' skinparam backgroundColour red\nA -> B")).toEqual([]);
  });
});

describe("colour names", () => {
  it.each<[string, string, string]>([
    ["element colour", "participant A #LightGren", 'unknown-color warning 2:14-24 "#LightGren"'],
    ["before a brace", "rectangle R #orangee {\n}", 'unknown-color warning 2:12-20 "#orangee"'],
    ["arrow colour", "A -[#bluee]-> B", 'unknown-color warning 2:4-10 "#bluee"'],
    ["activity colour", "start\n#palegren:step;\nstop", 'unknown-color warning 3:0-9 "#palegren"'],
    ["skinparam value", "skinparam BackgroundColor Whit", 'unknown-color warning 2:26-30 "Whit"'],
    ["gradient part", "skinparam classBackgroundColor #white/lightblu", 'unknown-color warning 2:38-46 "lightblu"'],
    ["creole tag", "A -> B : <color:purpel>hi</color>", 'unknown-color warning 2:16-22 "purpel"'],
    ["inline style value", "class A #back:lightyelow;line:red", 'unknown-color warning 2:14-24 "lightyelow"'],
  ])("%s", (_name, body, expected) => {
    expect(describeAll(`@startuml\n${body}\n@enduml`, uml(body))).toEqual([expected]);
  });

  it("suggests the nearest colour in the caller's casing and fixes it", () => {
    expect(uml("participant A #DarkOrnage")[0].message).toBe('Unknown colour "DarkOrnage". Did you mean "Darkorange"?');
    expect(uml("participant A #darkornage")[0].message).toBe('Unknown colour "darkornage". Did you mean "darkorange"?');
    expect(fix("@startuml\nparticipant A #SkyBleu\n@enduml", "unknown-color")).toBe("@startuml\nparticipant A #SkyBlue\n@enduml");
    // Two colours are equally close: both are offered.
    const tied = uml("participant A #LightGren")[0];
    expect(tied.message).toBe('Unknown colour "LightGren". Did you mean "LightGrey" or "LightGreen"?');
    expect(tied.fixes.map((f) => f.title)).toEqual(['Change to "#LightGrey"', 'Change to "#LightGreen"']);
    expect(fix("@startuml\nskinparam BackgroundColor Whit\n@enduml", "unknown-color")).toBe(
      "@startuml\nskinparam BackgroundColor White\n@enduml",
    );
  });

  it("leaves unknown names alone when nothing is close or the position is not clearly a colour", () => {
    expect(uml("participant A #brandprimary\nA -> B #lightgren : mid-statement\nclass C #gre")).toEqual([]);
  });
});

describe("themes and directives", () => {
  it.each<[string, string, string]>([
    ["misspelt theme", "!theme ceruleen", 'unknown-theme warning 2:7-15 "ceruleen"'],
    ["theme in the wrong case", "!theme Spacelab", 'unknown-theme warning 2:7-15 "Spacelab"'],
    ["misspelt directive", "!incldue <C4/C4>", 'unknown-directive warning 2:0-8 "!incldue"'],
    ["misspelt closer", "!if (1)\n!endfi", 'unknown-directive warning 3:0-6 "!endfi"'],
  ])("%s", (_name, body, expected) => {
    expect(describeAll(`@startuml\n${body}\n@enduml`, uml(body))).toContain(expected);
  });

  it("suggests and fixes", () => {
    expect(uml("!theme ceruleen")[0].message).toBe('Unknown theme "ceruleen". Did you mean "cerulean"?');
    expect(fix("@startuml\n!theme ceruleen\n@enduml", "unknown-theme")).toBe("@startuml\n!theme cerulean\n@enduml");
    expect(uml("!procedrue $p()")[0].message).toBe('Unknown preprocessor directive "!procedrue". Did you mean "!procedure"?');
    expect(fix("@startuml\n  !defin X 1\n@enduml", "unknown-directive")).toBe("@startuml\n  !define X 1\n@enduml");
  });

  it("does not guess at names that resemble nothing", () => {
    expect(uml("!theme mycompanytheme\n!frobnicate now\nA -> B")).toEqual([]);
  });
});

describe("helpers", () => {
  it("measures edit distance with swaps as one edit, capped", () => {
    expect(editDistance("kitten", "sitting", 5)).toBe(3);
    expect(editDistance("endfi", "endif", 2)).toBe(1);
    expect(editDistance("abc", "abc", 2)).toBe(0);
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
  });

  it("rewrites engine messages, keeping the diagram type the engine assumed", () => {
    expect(describeEngineError("Syntax Error? (Assumed diagram type: sequence)")).toBe(
      "Syntax error: PlantUML cannot read this line as part of a sequence diagram.",
    );
    expect(describeEngineError("Cannot create group (Assumed diagram type: activity)")).toBe(
      "Cannot create group (PlantUML is reading this as an activity diagram).",
    );
    expect(describeEngineError("No such color (Assumed diagram type: description)")).toBe(
      "No such color (PlantUML is reading this as a component, deployment or use case diagram).",
    );
    expect(describeEngineError("No if related to this endif")).toBe("No if related to this endif.");
    expect(describeEngineError("Syntax error")).toBe("Syntax error: PlantUML cannot read this line.");
  });

  it("leaves an already rewritten engine message as it is", () => {
    for (const raw of ["Syntax Error? (Assumed diagram type: class)", "No such color (Assumed diagram type: sequence)", "Syntax error"]) {
      const once = describeEngineError(raw);
      expect(describeEngineError(once)).toBe(once);
    }
  });

  it("finds the text of a line for marker ranges", () => {
    expect(contentColumns("   this is bad   ")).toEqual({ start: 3, end: 14 });
    expect(contentColumns("")).toEqual({ start: 0, end: 0 });
    expect(contentColumns("    ")).toEqual({ start: 0, end: 4 });
  });
});
