import { describe, expect, it } from "vitest";
import { analyze } from "../core/analysis";
import { complete } from "../core/completion";

function labelsAt(lastLine: string): string[] {
  const lines = ["@startgantt", "[Design] lasts 5 days", lastLine, "@endgantt"];
  return complete(analyze(lines.join("\n")), 2, lastLine.length).items.map((item) => item.label);
}

describe("Gantt colour completion", () => {
  it("offers colour names after 'is colored in'", () => {
    expect(labelsAt("[Design] is colored in ")).toContain("Coral");
    expect(labelsAt("[Design] is coloured in Coral/")).toContain("Black");
  });

  it("does not offer colours in the rest of a task sentence", () => {
    expect(labelsAt("[Design] is 40% ")).not.toContain("Coral");
  });
});
