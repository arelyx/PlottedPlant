import { describe, expect, it } from "vitest";
import { lookupDoc } from "../core/docs";
import { lookupDocAt } from "../core/docs-locate";

describe("lookupDocAt", () => {
  it("finds the word under the cursor with its range", () => {
    const line = "  activate Bob";
    const found = lookupDocAt(line, 4, "sequence");
    expect(found?.text).toBe("activate");
    expect([found?.startColumn, found?.endColumn]).toEqual([2, 10]);
    expect(found?.entry).toEqual(lookupDoc("activate", "sequence"));
    expect(lookupDocAt(line, 10, "sequence")).toBeUndefined();
  });

  it("prefers the longest documented phrase", () => {
    const line = "left to right direction";
    for (const column of [0, 6, 14, 22]) expect(lookupDocAt(line, column)?.text).toBe(line);
    expect(lookupDocAt("  end note", 7, "class")?.text).toBe("end note");
    expect(lookupDocAt("[Build] is colored in Coral", 12, "gantt")?.text).toBe("is colored in");
  });

  it("keeps directive, builtin and tag sigils", () => {
    expect(lookupDocAt("!include common.puml", 3)?.entry).toEqual(lookupDoc("!include"));
    expect(lookupDocAt("!if %strlen($name) > 3", 1)?.entry).toEqual(lookupDoc("!if"));
    expect(lookupDocAt("!if %strlen($name) > 3", 6)?.text).toBe("%strlen");
    expect(lookupDocAt("@startmindmap", 5)?.entry).toEqual(lookupDoc("@startmindmap"));
  });

  it("finds symbols", () => {
    expect(lookupDocAt("Order <|-- Invoice", 7, "class")?.text).toBe("<|--");
    expect(lookupDocAt("[*] --> Active", 1, "state")?.text).toBe("[*]");
    expect(lookupDocAt("== Shutdown ==", 0, "sequence")?.entry).toEqual(lookupDoc("==", "sequence"));
    expect(lookupDocAt("state c <<choice>>", 12, "state")?.text).toBe("<<choice>>");
  });

  it("finds skinparam names and block properties", () => {
    expect(lookupDocAt("skinparam ClassBorderColor red", 15)?.entry).toEqual(lookupDoc("ClassBorderColor"));
    expect(lookupDocAt("  BorderColor red", 4, "class")?.entry).toEqual(lookupDoc("BorderColor"));
  });

  it("ignores words that mean nothing in the given diagram kind", () => {
    expect(lookupDocAt("Alice -> Bob: this lasts long", 20, "sequence")).toBeUndefined();
    expect(lookupDocAt("[Design] lasts 5 days", 10, "gantt")?.text).toBe("lasts");
    expect(lookupDocAt("[Design] lasts 5 days", 10)?.text).toBe("lasts");
    expect(lookupDocAt("", 0)).toBeUndefined();
  });
});
