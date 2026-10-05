import { describe, expect, it } from "vitest";
import { parseBlocks } from "../core/blocks";

describe("parseBlocks", () => {
  it("splits a document into blocks and flags unclosed ones", () => {
    const lines = ["@startuml", "Alice -> Bob: hi", "@enduml", "", "@startmindmap", "* root"];
    expect(parseBlocks(lines)).toEqual([
      { tag: "uml", kind: "sequence", startLine: 0, endLine: 2, closed: true },
      { tag: "mindmap", kind: "mindmap", startLine: 4, endLine: 5, closed: false },
    ]);
  });
});
