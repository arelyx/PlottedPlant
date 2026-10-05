import { describe, expect, it } from "vitest";
import { complete, type CompletionCategory } from "../core/completion";
import { CURSOR, withCursor } from "./intelligence-helpers";

function run(source: string, trigger?: string) {
  const { analysis, line, column } = withCursor(source);
  const list = complete(analysis, line, column, { trigger });
  const categories = [...new Set(list.items.map((i) => i.category))].sort();
  return { list, categories, labels: list.items.map((i) => i.label), context: list.context.kind };
}

const SEQ = `@startuml\nparticipant "Web Browser" as Browser\nactor User\nUser -> Browser: open\n`;
const CLS = `@startuml\nclass Shape <<Entity>>\nclass Circle\nShape <|-- Circle\n`;

/** [name, source with cursor, trigger character, expected context, expected item categories] */
const TABLE: [string, string, string | undefined, string, CompletionCategory[]][] = [
  ["outside any block", `${CURSOR}`, undefined, "top", ["snippet", "tag"]],
  ["@ outside a block", `@${CURSOR}`, "@", "tag", ["tag"]],
  ["@ inside an open block", `@startuml\nA -> B\n@${CURSOR}`, "@", "tag", ["tag"]],
  ["line start in a sequence diagram", `${SEQ}${CURSOR}\n@enduml`, undefined, "line-start", ["keyword", "snippet", "symbol"]],
  ["typing a first word", `${SEQ}Us${CURSOR}\n@enduml`, undefined, "line-start", ["keyword", "snippet", "symbol"]],
  ["after a name and a space", `${SEQ}User ${CURSOR}\n@enduml`, " ", "arrow", ["arrow"]],
  ["while typing an arrow", `${SEQ}User -${CURSOR}\n@enduml`, undefined, "arrow", ["arrow"]],
  ["after an arrow", `${SEQ}User -> ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["typing the target name", `${SEQ}User -> Br${CURSOR}\n@enduml`, undefined, "name", ["symbol"]],
  ["after activate", `${SEQ}activate ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["after note", `${SEQ}note ${CURSOR}\n@enduml`, " ", "continuation", ["keyword"]],
  ["after note left of", `${SEQ}note left of ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["second name after note over", `${SEQ}note over User, ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["after hide", `${SEQ}hide ${CURSOR}\n@enduml`, " ", "continuation", ["keyword"]],
  ["skinparam name", `@startuml\nskinparam ${CURSOR}\n@enduml`, " ", "skinparam-name", ["skinparam"]],
  ["skinparam colour value", `@startuml\nskinparam ArrowColor ${CURSOR}\n@enduml`, " ", "value", ["color"]],
  ["skinparam font style value", `@startuml\nskinparam ClassFontStyle ${CURSOR}\n@enduml`, " ", "value", ["value"]],
  ["name inside a skinparam block", `@startuml\nskinparam class {\n  Back${CURSOR}\n}\n@enduml`, undefined, "skinparam-name", ["skinparam"]],
  ["value inside a skinparam block", `@startuml\nskinparam class {\n  BackgroundColor ${CURSOR}\n}\n@enduml`, " ", "value", ["color"]],
  ["# after a participant", `@startuml\nparticipant A #${CURSOR}\n@enduml`, "#", "color", ["color"]],
  ["# inside an arrow style", `${SEQ}User -[#${CURSOR}\n@enduml`, "#", "color", ["color"]],
  ["! directive", `@startuml\n!${CURSOR}\n@enduml`, "!", "directive", ["directive"]],
  ["!theme name", `@startuml\n!theme ${CURSOR}\n@enduml`, " ", "theme", ["theme"]],
  ["% builtin", `@startuml\nA -> B : %${CURSOR}\n@enduml`, "%", "builtin", ["builtin"]],
  ["$ user symbols", `@startuml\n!$x = 1\n!procedure $go($a)\n!endprocedure\nA -> B : $${CURSOR}\n@enduml`, "$", "preprocessor", ["function", "variable"]],
  ["<& icon", `@startuml\nA -> B : <&${CURSOR}\n@enduml`, "&", "icon", ["icon"]],
  ["<: emoji", `@startuml\nA -> B : <:${CURSOR}\n@enduml`, ":", "emoji", ["emoji"]],
  ["< creole tag in a label", `@startuml\nA -> B : <${CURSOR}\n@enduml`, "<", "creole", ["creole"]],
  ["<< stereotype", `${CLS}class Square <<${CURSOR}\n@enduml`, "<", "stereotype", ["stereotype"]],
  ["<style> top level", `@startuml\n<style>\n${CURSOR}\n</style>\n@enduml`, undefined, "style", ["style"]],
  ["<style> property value", `@startuml\n<style>\nclassDiagram {\n  BackGroundColor ${CURSOR}\n}\n</style>\n@enduml`, " ", "value", ["color"]],
  ["class relation arrow", `${CLS}Shape ${CURSOR}\n@enduml`, " ", "arrow", ["arrow"]],
  ["after extends", `${CLS}class Square extends ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["class declaration continuation", `${CLS}class Square ${CURSOR}\n@enduml`, undefined, "continuation", ["keyword"]],
  ["state transition target", `@startuml\n[*] --> Idle\nIdle --> ${CURSOR}\n@enduml`, " ", "name", ["symbol"]],
  ["after [*]", `@startuml\n[*] ${CURSOR}\n@enduml`, " ", "arrow", ["arrow"]],
  ["use case in parentheses", `@startuml\nactor User\n(Login) as UC1\nUser --> (${CURSOR}\n@enduml`, "(", "name", ["symbol"]],
  ["component in brackets", `@startuml\n[Web App] as Web\n[DB]\nWeb --> [${CURSOR}\n@enduml`, "[", "name", ["symbol"]],
  ["Gantt verbs after a task", `@startgantt\n[Design] lasts 5 days\n[Build] ${CURSOR}\n@endgantt`, " ", "continuation", ["keyword"]],
  ["Gantt task reference", `@startgantt\n[Design] lasts 5 days\n[Build] starts at [${CURSOR}\n@endgantt`, "[", "name", ["symbol"]],
  ["activity swimlane", `@startuml\n|Lane A|\nstart\n|${CURSOR}\n@enduml`, "|", "name", ["symbol"]],
  ["timing @participant", `@startuml\nrobust "Web" as WB\n@${CURSOR}\n@enduml`, "@", "tag", ["symbol", "tag"]],
  ["mindmap line start", `@startmindmap\n* Root\n${CURSOR}\n@endmindmap`, undefined, "line-start", ["keyword", "snippet"]],
  ["nwdiag node attributes", `@startuml\nnwdiag {\n  network dmz {\n    web01 [${CURSOR}\n  }\n}\n@enduml`, "[", "continuation", ["keyword"]],

  // Negative cases: free text must stay quiet.
  ["message label", `${SEQ}User -> Browser: hello ${CURSOR}\n@enduml`, " ", "none", []],
  ["message label while typing a word", `${SEQ}User -> Browser: he${CURSOR}\n@enduml`, undefined, "none", []],
  ["note body", `${SEQ}note left of User\n  some ${CURSOR}\nend note\n@enduml`, " ", "none", []],
  ["note body word", `${SEQ}note left of User\n  User${CURSOR}\nend note\n@enduml`, undefined, "none", []],
  ["single-line note text", `${SEQ}note left of User: a ${CURSOR}\n@enduml`, " ", "none", []],
  ["comment", `${SEQ}' a comment ${CURSOR}\n@enduml`, " ", "none", []],
  ["block comment", `${SEQ}/' multi\n line ${CURSOR}\n'/\n@enduml`, " ", "none", []],
  ["new participant name", `${SEQ}participant ${CURSOR}\n@enduml`, " ", "none", []],
  ["title text", `${SEQ}title My ${CURSOR}\n@enduml`, " ", "none", []],
  ["multi-line title", `${SEQ}title\n  Big ${CURSOR}\nend title\n@enduml`, " ", "none", []],
  ["legend body", `${SEQ}legend right\n  key ${CURSOR}\nendlegend\n@enduml`, " ", "none", []],
  ["indentation", `${SEQ}  ${CURSOR}\n@enduml`, " ", "line-start", []],
  ["group label", `${SEQ}alt user is ${CURSOR}\n@enduml`, " ", "none", []],
  ["inside a quoted name", `${SEQ}User -> "Some ${CURSOR}\n@enduml`, " ", "none", []],
  ["activity label", `@startuml\nstart\n:do ${CURSOR}\n@enduml`, " ", "none", []],
  ["multi-line activity label", `@startuml\nstart\n:first line\nsecond ${CURSOR}\nthird;\n@enduml`, " ", "none", []],
  ["activity condition", `@startuml\nstart\nif (is it ${CURSOR}\n@enduml`, " ", "none", []],
  ["mindmap node text", `@startmindmap\n* Root\n** New ${CURSOR}\n@endmindmap`, " ", "none", []],
  ["class member", `@startuml\nclass A {\n  +name ${CURSOR}\n}\n@enduml`, " ", "none", []],
  ["JSON data", `@startjson\n{ "a": ${CURSOR}\n@endjson`, " ", "none", []],
  ["Salt wireframe", `@startsalt\n{\n  [OK] | ${CURSOR}\n}\n@endsalt`, " ", "none", []],
  ["# in a label is not a colour", `${SEQ}User -> Browser: issue #${CURSOR}\n@enduml`, "#", "none", []],
  ["percent sign after a number", `@startgantt\n[A] lasts 2 days\n[A] is 40%${CURSOR}\n@endgantt`, "%", "none", []],
  ["( that opens a call is left to signature help", `${SEQ}!$x = %strlen(${CURSOR}\n@enduml`, "(", "none", []],
  ["text outside any block", `some prose ${CURSOR}`, " ", "none", []],
];

describe("completion contexts", () => {
  it.each(TABLE)("%s", (_name, source, trigger, context, categories) => {
    const result = run(source, trigger);
    expect(result.context).toBe(context);
    expect(result.categories).toEqual([...categories].sort());
  });
});

describe("completion items", () => {
  it("offers the declared participants with their kind, and not the word being typed", () => {
    const { list } = run(`${SEQ}User -> Br${CURSOR}\n@enduml`);
    expect(list.items.map((i) => [i.label, i.detail])).toEqual([
      ["Browser", 'participant "Web Browser"'],
      ["User", "actor"],
    ]);
    expect(list.start).toBe(8);
  });

  it("ranks participants before keywords in a sequence diagram and offers snippets", () => {
    const { list } = run(`${SEQ}${CURSOR}\n@enduml`);
    const sorted = [...list.items].sort((a, b) => a.sortText.localeCompare(b.sortText)).map((i) => i.label);
    expect(sorted.slice(0, 4)).toEqual(["Browser", "User", "participant", "actor"]);
    expect(sorted).toContain("activate");
    expect(sorted).toContain("note over");
    expect(sorted).not.toContain("class");
    expect(list.items.some((i) => i.category === "snippet" && i.snippet)).toBe(true);
  });

  it("offers class keywords before symbols in a class diagram", () => {
    const { list } = run(`${CLS}${CURSOR}\n@enduml`);
    const sorted = [...list.items].sort((a, b) => a.sortText.localeCompare(b.sortText)).map((i) => i.label);
    expect(sorted.slice(0, 3)).toEqual(["class", "abstract class", "interface"]);
    expect(sorted).toContain("Shape");
    expect(sorted).not.toContain("participant");
  });

  it("offers arrows of the diagram kind with descriptions", () => {
    expect(run(`${SEQ}User ${CURSOR}\n@enduml`).labels.slice(0, 4)).toEqual(["->", "-->", "->>", "-->>"]);
    const cls = run(`${CLS}Shape ${CURSOR}\n@enduml`);
    expect(cls.labels).toContain("<|--");
    expect(cls.labels).toContain("*--");
    expect(cls.list.items.every((i) => i.detail && i.retrigger)).toBe(true);
    expect(run(`@startuml\nentity A {\n}\nentity B {\n}\nA ${CURSOR}\n@enduml`).labels[0]).toBe("||--o{");
  });

  it("inserts @start tags with their matching @end, and closes the open block first", () => {
    const top = run(`@${CURSOR}`).list.items;
    expect(top[0]).toMatchObject({ label: "@startuml", insertText: "@startuml\n$0\n@enduml", snippet: true });
    expect(top.find((i) => i.label === "@startmindmap")?.insertText).toBe("@startmindmap\n$0\n@endmindmap");
    const inside = run(`@startgantt\n[A] lasts 2 days\n@${CURSOR}`).list.items;
    expect([...inside].sort((a, b) => a.sortText.localeCompare(b.sortText))[0].label).toBe("@endgantt");
  });

  it("offers all skinparams, relative ones first inside a block", () => {
    expect(run(`@startuml\nskinparam ${CURSOR}\n@enduml`, " ").list.items).toHaveLength(478);
    const inBlock = run(`@startuml\nskinparam class {\n  ${CURSOR}\n}\n@enduml`).list.items;
    const first = [...inBlock].sort((a, b) => a.sortText.localeCompare(b.sortText))[0];
    expect(first).toMatchObject({ label: "AttributeFontColor", detail: "ClassAttributeFontColor" });
    expect(inBlock.map((i) => i.label)).toContain("BackgroundColor");
  });

  it("gives colour items their hex value for the swatch", () => {
    const { list } = run(`@startuml\nparticipant A #${CURSOR}\n@enduml`, "#");
    expect(list.items).toHaveLength(154);
    expect(list.items.find((i) => i.label === "LightBlue")).toMatchObject({ category: "color", color: "#add8e6", documentation: "#add8e6" });
    expect(list.items.every((i) => /^#[0-9a-f]{6}$/.test(i.color ?? ""))).toBe(true);
    expect(list.start).toBe(15);
  });

  it("offers builtin functions with their arity", () => {
    const { list } = run(`@startuml\nA -> B : %str${CURSOR}\n@enduml`);
    const substr = list.items.find((i) => i.label === "%substr");
    expect(substr).toMatchObject({ detail: "%substr(text, start, length?)", insertText: "%substr(${1:text}, ${2:start})", snippet: true });
    expect(list.start).toBe(9);
  });

  it("offers user variables, procedures with signature snippets, and parameters in scope", () => {
    const source = `@startuml\n!$count = 3\n!procedure $send($from, $to, $label="ping")\n  $from -> $to : $${CURSOR}\n!endprocedure\n@enduml`;
    const { list } = run(source, "$");
    expect(list.items.map((i) => i.label)).toEqual(["$from", "$to", "$label", "$count", "$send"]);
    expect(list.items.find((i) => i.label === "$send")).toMatchObject({ insertText: "\\$send(${1:from}, ${2:to})", snippet: true });
    const outside = run(`@startuml\n!procedure $send($from)\n!endprocedure\n$${CURSOR}\n@enduml`, "$");
    expect(outside.labels).toEqual(["$send"]);
  });

  it("offers macros without a $ at line start", () => {
    const { list } = run(`@startuml\n!define BOX(x) participant x\n!procedure Service(name, label)\n!endprocedure\n${CURSOR}\n@enduml`);
    expect(list.items.filter((i) => i.category === "function").map((i) => i.insertText)).toEqual(["BOX(${1:x})", "Service(${1:name}, ${2:label})"]);
  });

  it("offers stereotypes already used in the document, plus the state pseudo-states", () => {
    expect(run(`${CLS}class Square <<${CURSOR}\n@enduml`, "<").list.items.map((i) => i.insertText)).toEqual(["Entity>>"]);
    expect(run(`@startuml\nstate A <<${CURSOR}\n@enduml`, "<").labels).toContain("choice");
  });

  it("writes names with the delimiters their dialect needs", () => {
    const component = run(`@startuml\n[Web App] as Web\n[Data Store]\nWeb --> ${CURSOR}\n@enduml`, " ");
    expect(component.list.items.map((i) => i.insertText)).toEqual(["Web", "[Data Store]"]);
    const bracket = run(`@startuml\n[Web App] as Web\n[Data Store]\nWeb --> [${CURSOR}\n@enduml`, "[");
    // `[Web]` is a valid way to write the aliased component, so it is offered too.
    expect(bracket.list.items.map((i) => i.insertText)).toEqual(["Web]", "Data Store]"]);
    const gantt = run(`@startgantt\n[Design phase] lasts 5 days\n[Build] starts at ${CURSOR}\n@endgantt`, " ");
    expect(gantt.list.items.map((i) => i.insertText)).toEqual(["[Design phase]", "[Build]"]);
    const quoted = run(`@startuml\n"Bank Customer" -> Teller\nTeller -> ${CURSOR}\n@enduml`, " ");
    expect(quoted.list.items.map((i) => i.insertText)).toEqual(['"Bank Customer"', "Teller"]);
  });

  it("offers icons, emoji and themes from PlantUML's own lists", () => {
    expect(run(`@startuml\nA -> B : <&${CURSOR}\n@enduml`, "&").list.items).toHaveLength(223);
    expect(run(`@startuml\nA -> B : <:${CURSOR}\n@enduml`, ":").list.items.length).toBeGreaterThan(1000);
    expect(run(`@startuml\n!theme ${CURSOR}\n@enduml`, " ").labels).toContain("cerulean");
    expect(run(`@startuml\n!${CURSOR}\n@enduml`, "!").labels).toContain("!include");
  });

  it("offers style selectors at the top of <style> and properties inside a rule", () => {
    expect(run(`@startuml\n<style>\n${CURSOR}\n</style>\n@enduml`).labels).toContain("sequenceDiagram");
    const inside = run(`@startuml\n<style>\nclassDiagram {\n  ${CURSOR}\n}\n</style>\n@enduml`);
    expect(inside.labels).toContain("BackGroundColor");
    expect(inside.labels).toContain("class");
  });

  it("only offers snippets that apply to the diagram kind", () => {
    const gantt = run(`@startgantt\n${CURSOR}\n@endgantt`).list.items.filter((i) => i.category === "snippet").map((i) => i.label);
    const sequence = run(`${SEQ}${CURSOR}\n@enduml`).list.items.filter((i) => i.category === "snippet").map((i) => i.label);
    expect(sequence).toContain("alt");
    expect(gantt).not.toContain("alt");
    const top = run(`${CURSOR}`).list.items.filter((i) => i.category === "snippet").map((i) => i.label);
    expect(top).toContain("sequence");
    expect(top).not.toContain("alt");
  });
});
