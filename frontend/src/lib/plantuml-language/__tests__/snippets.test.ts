import { describe, expect, it } from "vitest";
import { ALL_KINDS } from "../core/docs-model";
import { snippetDefs as defs } from "../core/snippets";
import { analyzeSnippet, expandSnippet, expandSnippetVariants, type SnippetDef } from "../core/snippets-model";
import type { DiagramKind } from "../core/types";

// Offline checks only. Whether each expanded body is accepted by PlantUML is
// checked against a real server by scripts/validate-plantuml-content.mjs.

const label = (s: SnippetDef) => `${Array.isArray(s.scope) ? s.scope.join(",") : s.scope}:${s.prefix}`;

/** Collect a message per offending snippet so one failure lists them all. */
function offenders(check: (s: SnippetDef) => string | undefined): string[] {
  return defs.flatMap((s) => {
    const problem = check(s);
    return problem ? [`${label(s)}: ${problem}`] : [];
  });
}

describe("analyzeSnippet", () => {
  it("expands placeholders, choices, mirrors and escapes", () => {
    expect(expandSnippet("${1:Alice} -> ${2:Bob}: ${3:hi}\n$0")).toBe("Alice -> Bob: hi\n");
    expect(expandSnippet("${1|left,right|} of $2 ${2:A}")).toBe("left of A A");
    expect(expandSnippet("!\\$x = ${1:1}\nmap M {\n\tk => v\n}")).toBe("!$x = 1\nmap M {\n\tk => v\n}");
    expect(expandSnippet("${1:outer ${2:inner}}")).toBe("outer inner");
    expect(expandSnippet("${1:a \\} b}")).toBe("a } b");
  });

  it("lists one expansion per choice option", () => {
    expect(expandSnippetVariants("note ${1|left,right|} of ${2:A}: ${3|a,b|}")).toEqual([
      "note left of A: a",
      "note right of A: a",
      "note left of A: b",
    ]);
    expect(expandSnippetVariants("${1:plain}")).toEqual(["plain"]);
  });

  it("reports malformed bodies", () => {
    expect(analyzeSnippet("!$x = 1").problems).toHaveLength(1);
    expect(analyzeSnippet("${1:open").problems).toHaveLength(1);
    expect(analyzeSnippet("${1|a,b}").problems).toHaveLength(1);
    expect(analyzeSnippet("$1 and $2").withoutDefault).toEqual([1, 2]);
    expect(analyzeSnippet("${1:x} $0").tabStops).toEqual([1, 0]);
  });
});

describe("snippets", () => {
  it("has a usable prefix and description on every snippet", () => {
    expect(
      offenders((s) => {
        if (!/^[^\s]+$/.test(s.prefix)) return "prefix must be non-empty without whitespace";
        if (!s.description.trim()) return "empty description";
        if (s.description.length > 80) return "description longer than 80 characters";
        if (/\.$/.test(s.description)) return "description should be a phrase without a final period";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("uses well-formed tab stops, each with a default", () => {
    expect(
      offenders((s) => {
        const a = analyzeSnippet(s.body);
        if (a.problems.length) return a.problems.join("; ");
        if (a.withoutDefault.length) return `tab stops without default text: ${a.withoutDefault.join(", ")}`;
        const numbered = a.tabStops.filter((n) => n !== 0).sort((x, y) => x - y);
        if (numbered.some((n, i) => n !== i + 1)) return `tab stops are not numbered 1..n: ${numbered.join(", ")}`;
        if ((s.body.match(/\$0|\$\{0\}/g) ?? []).length > 1) return "more than one final cursor position";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("indents with tabs so the editor can apply the user's indentation", () => {
    const spaceIndented = (s: SnippetDef) => (Array.isArray(s.scope) ? s.scope : []).some((k) => k === "yaml" || k === "ditaa");
    expect(
      offenders((s) => {
        if (spaceIndented(s) || s.expect === "YAML" || s.tag === "ditaa" || /@startditaa/.test(s.body)) return undefined;
        return /^ +\S/m.test(s.body) ? "line indented with spaces" : undefined;
      }),
    ).toEqual([]);
  });

  it("uses valid scopes", () => {
    expect(
      offenders((s) => {
        if (s.scope === "any" || s.scope === "top") return undefined;
        if (!Array.isArray(s.scope) || s.scope.length === 0) return "scope must be a non-empty list, 'any' or 'top'";
        if (s.scope.some((k) => !ALL_KINDS.includes(k))) return "unknown diagram kind in scope";
        if (new Set(s.scope).size !== s.scope.length) return "duplicate kind in scope";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("gives starters a balanced @start/@end pair and an expected diagram type", () => {
    expect(
      offenders((s) => {
        const text = expandSnippet(s.body).trim();
        const start = /^@start(\w+)/.exec(text);
        if (s.scope !== "top") return /@start|@end/.test(text) ? "only starters may contain @start/@end" : undefined;
        if (!start) return "starter must begin with @start…";
        if (!text.endsWith(`@end${start[1]}`)) return `starter must end with @end${start[1]}`;
        if ((text.match(/^@start/gm) ?? []).length !== 1) return "starter must contain exactly one diagram";
        if (s.expect === undefined && !s.skip) return "starter needs `expect` (diagram type) or `skip`";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("has no duplicate prefix among the snippets offered in one place", () => {
    const duplicates: string[] = [];
    const check = (where: string, list: SnippetDef[]) => {
      const seen = new Set<string>();
      for (const s of list) {
        if (seen.has(s.prefix)) duplicates.push(`${where}: ${s.prefix}`);
        seen.add(s.prefix);
      }
    };
    check("top", defs.filter((s) => s.scope === "top"));
    for (const kind of ALL_KINDS) {
      check(kind, defs.filter((s) => s.scope === "any" || (Array.isArray(s.scope) && s.scope.includes(kind))));
    }
    expect(duplicates).toEqual([]);
  });

  it("offers a starter for every diagram type", () => {
    const types = new Set(defs.filter((s) => s.scope === "top").map((s) => s.expect));
    const required = [
      "SEQUENCE", "CLASS", "ACTIVITY", "STATE", "DESCRIPTION", "TIMING", "NWDIAG", "GANTT",
      "MINDMAP", "WBS", "SALT", "JSON", "YAML", "EBNF", "REGEX", "CHEN_EER",
    ];
    expect(required.filter((t) => !types.has(t))).toEqual([]);
  });

  it("offers constructs inside every diagram kind that has a body syntax", () => {
    const kinds: DiagramKind[] = [
      "sequence", "class", "object", "usecase", "activity", "state", "component", "deployment", "er",
      "timing", "nwdiag", "gantt", "mindmap", "wbs", "salt", "json", "yaml",
    ];
    const thin = kinds.filter((k) => defs.filter((s) => Array.isArray(s.scope) && s.scope.includes(k)).length < 3);
    expect(thin).toEqual([]);
    expect(defs.filter((s) => s.scope === "any").length).toBeGreaterThanOrEqual(20);
  });
});
