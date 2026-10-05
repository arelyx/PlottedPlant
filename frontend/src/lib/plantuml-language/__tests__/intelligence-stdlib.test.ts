import { describe, expect, it } from "vitest";
import { complete } from "../core/completion";
import { hover } from "../core/hover";
import { signatureHelp } from "../core/signature";
import { stdlibIncludePaths, stdlibMacrosFor } from "../core/stdlib";
import { CURSOR, withCursor } from "./intelligence-helpers";

describe("C4 standard library", () => {
  it("resolves the include chain", () => {
    const names = stdlibMacrosFor(["<C4/C4_Container>"]).map((m) => m.name);
    expect(names).toContain("Container");
    expect(names).toContain("Person");
    expect(names).toContain("Rel");
    expect(names).not.toContain("Component");
    expect(stdlibMacrosFor(["<C4/C4_Component>"]).map((m) => m.name)).toContain("Component");
    expect(stdlibMacrosFor([])).toEqual([]);
    expect(stdlibMacrosFor(["other.puml"])).toEqual([]);
    expect(stdlibMacrosFor(["https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml"]).map((m) => m.name)).toContain("System");
  });

  it("completes include paths after `!include <`", () => {
    const { analysis, line, column } = withCursor(`@startuml\n!include <${CURSOR}\n@enduml`);
    const list = complete(analysis, line, column, { trigger: "<" });
    expect(list.items.map((i) => i.label)).toEqual(stdlibIncludePaths());
    expect(list.items.find((i) => i.label === "C4/C4_Container")?.insertText).toBe("C4/C4_Container>");
  });

  it("offers the macros at line start only when the library is included", () => {
    const withInclude = withCursor(`@startuml\n!include <C4/C4_Container>\n${CURSOR}\n@enduml`);
    const items = complete(withInclude.analysis, withInclude.line, withInclude.column).items;
    const person = items.find((i) => i.label === "Person");
    expect(person).toMatchObject({ category: "function", insertText: "Person(${1:alias}, ${2:label})", snippet: true });
    expect(person?.detail).toContain("Person(alias, label, descr");
    const without = withCursor(`@startuml\n${CURSOR}\n@enduml`);
    expect(complete(without.analysis, without.line, without.column).items.some((i) => i.label === "Person")).toBe(false);
  });

  it("gives signature help and hover for the macros", () => {
    const call = withCursor(`@startuml\n!include <C4/C4_Container>\nRel(user, app, ${CURSOR}\n@enduml`);
    const help = signatureHelp(call.analysis, call.line, call.column);
    expect(help?.label.startsWith("Rel(from, to, label")).toBe(true);
    expect(help?.activeParameter).toBe(2);
    const over = withCursor(`@startuml\n!include <C4/C4_Container>\nConta${CURSOR}iner(app, "App")\n@enduml`);
    expect(hover(over.analysis, over.line, over.column)?.contents[0]).toContain("Container(alias, label");
  });
});
