import { describe, expect, it } from "vitest";
import { allDocRecords, lookupDoc, lookupDocStrict } from "../core/docs";
import { ALL_KINDS, type DocRecord, LINKS, normalizeTerm } from "../core/docs-model";
import type { DiagramKind } from "../core/types";
import { vocab } from "../vocab";

// Offline checks only. Whether each example is accepted by PlantUML is checked
// against a real server by scripts/validate-plantuml-content.mjs.

const records = allDocRecords();
const label = (r: DocRecord) => `${r.terms[0]}${r.kinds ? `[${r.kinds.join(",")}]` : ""}`;
const missing = (terms: string[], kind?: DiagramKind) => terms.filter((t) => !lookupDoc(t, kind));

function offenders(check: (r: DocRecord) => string | undefined): string[] {
  return records.flatMap((r) => {
    const problem = check(r);
    return problem ? [`${label(r)}: ${problem}`] : [];
  });
}

/** The %builtin functions defined by PlantUML 1.2026 (tim/builtin in its source). */
const BUILTINS = [
  "and", "backslash", "boolval", "breakline", "call_user_func", "chr", "darken", "date", "dec2hex", "dirpath",
  "dollar", "eval", "false", "feature", "file_exists", "filedate", "filename", "filename_no_extension",
  "function_exists", "get_all_stdlib", "get_all_theme", "get_current_theme", "get_json_keys", "get_json_type",
  "get_stdlib", "get_variable_value", "getenv", "hex2dec", "hsl_color", "intval", "invoke_procedure", "is_dark",
  "is_light", "json_add", "json_key_exists", "json_merge", "json_remove", "json_set", "left_align", "lighten",
  "load_json", "lower", "mod", "n", "nand", "newline", "nor", "not", "now", "nxor", "or", "ord", "percent",
  "random", "retrieve_procedure", "reverse_color", "reverse_hsluv_color", "right_align", "set_variable_value",
  "size", "splitstr", "splitstr_regex", "str2json", "string", "strlen", "strpos", "substr", "tab", "true",
  "upper", "variable_exists", "version", "xargs", "xor",
];

/** Words PlantUML's own keyword list lacks, per diagram kind. */
const DIALECT: Partial<Record<DiagramKind, string[]>> = {
  sequence: [
    "activate", "deactivate", "destroy", "create", "autonumber", "autoactivate", "alt", "else", "opt", "loop", "par",
    "break", "critical", "group", "end", "ref", "box", "return", "==", "...", "|||", "hnote", "rnote", "note",
    "participant", "actor", "boundary", "control", "entity", "database", "collections", "queue", "newpage",
  ],
  class: [
    "class", "interface", "enum", "abstract", "extends", "implements", "package", "namespace", "note",
    "<|--", "*--", "o--", "-->", "..>", "..|>", "{static}", "{abstract}", "hide", "show", "remove",
  ],
  object: ["object", "map"],
  usecase: ["actor", "usecase", "rectangle", "package"],
  component: ["component", "interface", "package", "node", "database", "port", "portin", "portout"],
  deployment: ["node", "artifact", "cloud", "database", "storage", "queue", "frame", "folder"],
  activity: [
    "start", "stop", "end", "if", "then", "else", "elseif", "endif", "switch", "case", "endswitch", "while",
    "endwhile", "repeat", "repeat while", "backward", "fork", "fork again", "end fork", "split", "split again",
    "end split", "partition", "detach", "kill", "note", "floating note", "group",
  ],
  state: ["state", "[*]", "[H]", "[H*]", "<<choice>>", "<<fork>>", "<<join>>", "<<end>>", "note", "--", "||"],
  er: ["entity", "||--o{", "}o--o{", "||--||", "|o--o|"],
  chen: ["entity", "relationship", "<<key>>", "<<derived>>", "<<multi>>"],
  timing: ["robust", "concise", "clock", "binary", "analog", "is", "highlight", "scale", "@"],
  gantt: [
    "lasts", "starts", "ends", "happens", "then", "is colored in", "closed", "open", "printscale", "project starts",
    "requires", "days", "weeks", "is", "completed", "on", "today", "at", "after", "before", "--",
  ],
  mindmap: ["*", "+", "-", "_", "left side", "right side"],
  wbs: ["*", "+", "-", "_"],
  salt: ["{", "{#", "{!", "{-", "{+", "{T", "{/", "{*", "{^", "{S", "[]", "[X]", "()", "(X)", "^", "..", "==", "~~", "--"],
  json: ["#highlight"],
  yaml: ["#highlight"],
  nwdiag: ["nwdiag", "network", "address", "description", "shape", "group", "color", "inet"],
};

describe("lookupDoc coverage of PlantUML's vocabulary", () => {
  it("documents every element type", () => {
    expect(missing(vocab.types)).toEqual([]);
  });

  it("documents every keyword", () => {
    expect(missing(vocab.keywords)).toEqual([]);
  });

  it("documents every preprocessor directive, with and without the '!'", () => {
    expect(missing(vocab.preprocessor.map((d) => `!${d}`))).toEqual([]);
    expect(missing(vocab.preprocessor)).toEqual([]);
    const notDirectiveDocs = vocab.preprocessor.filter((d) => !lookupDoc(`!${d}`)?.signature?.startsWith("!"));
    expect(notDirectiveDocs).toEqual([]);
  });

  it("documents every @start and @end tag", () => {
    expect(missing(vocab.startTags.flatMap((t) => [`@start${t}`, `@end${t}`]))).toEqual([]);
  });

  it("documents every skinparam", () => {
    expect(missing(vocab.skinparams)).toEqual([]);
  });

  it("documents every %builtin function, with and without the '%'", () => {
    expect(missing(BUILTINS.map((b) => `%${b}`))).toEqual([]);
    expect(missing(BUILTINS)).toEqual([]);
    expect(BUILTINS.filter((b) => !lookupDoc(`%${b}`)?.signature?.startsWith(`%${b}`))).toEqual([]);
  });

  it("documents the per-diagram words PlantUML's list lacks", () => {
    const gaps: string[] = [];
    for (const [kind, terms] of Object.entries(DIALECT) as [DiagramKind, string[]][]) {
      for (const term of terms) if (!lookupDocStrict(term, kind)) gaps.push(`${kind}: ${term}`);
    }
    expect(gaps).toEqual([]);
  });
});

describe("lookupDoc behaviour", () => {
  it("matches case-insensitively and collapses whitespace", () => {
    expect(lookupDoc("SKINPARAM")).toEqual(lookupDoc("skinparam"));
    expect(lookupDoc("left  to right   direction")).toEqual(lookupDoc("left to right direction"));
    expect(lookupDoc("classbordercolor")).toEqual(lookupDoc("ClassBorderColor"));
  });

  it("returns undefined for unknown words", () => {
    expect(lookupDoc("definitely-not-plantuml")).toBeUndefined();
    expect(lookupDoc("")).toBeUndefined();
  });

  it("returns only the DocEntry fields", () => {
    const allowed = ["signature", "body", "example", "link"];
    for (const term of ["note", "class", "!include", "ClassBorderColor", "@startuml"]) {
      expect(Object.keys(lookupDoc(term) ?? {}).filter((k) => !allowed.includes(k))).toEqual([]);
    }
  });

  it("keeps directives apart from keywords spelled the same", () => {
    for (const word of ["else", "endif", "if", "while", "endwhile", "return"]) {
      expect(lookupDoc(`!${word}`)?.body).not.toEqual(lookupDoc(word)?.body);
    }
  });

  it("returns different entries for a word whose meaning depends on the diagram", () => {
    const cases: [string, DiagramKind, DiagramKind][] = [
      ["note", "sequence", "class"],
      ["end", "sequence", "activity"],
      ["else", "sequence", "activity"],
      ["entity", "sequence", "er"],
      ["interface", "class", "component"],
      ["package", "class", "component"],
      ["start", "activity", "gantt"],
      ["is", "timing", "gantt"],
      ["group", "sequence", "nwdiag"],
      ["group", "sequence", "activity"],
      ["break", "sequence", "activity"],
      ["label", "component", "activity"],
      ["actor", "sequence", "usecase"],
      ["database", "sequence", "deployment"],
      ["highlight", "timing", "json"],
      ["then", "activity", "gantt"],
      ["--", "state", "gantt"],
      ["==", "sequence", "salt"],
    ];
    const same = cases.filter(([term, a, b]) => {
      const first = lookupDoc(term, a);
      const second = lookupDoc(term, b);
      return !first || !second || first.body === second.body;
    });
    expect(same).toEqual([]);
  });

  it("answers strictly only where the word applies", () => {
    expect(lookupDocStrict("lasts", "gantt")).toBeDefined();
    expect(lookupDocStrict("lasts", "sequence")).toBeUndefined();
    expect(lookupDocStrict("title", "sequence")).toBeDefined();
    expect(lookupDocStrict("class", "object")).toBeDefined();
  });
});

describe("documentation records", () => {
  it("have well-formed terms and kinds", () => {
    expect(
      offenders((r) => {
        if (r.terms.length === 0) return "no terms";
        if (r.terms.some((t) => !t || t !== t.trim())) return "empty or padded term";
        if (r.kinds && r.kinds.length === 0) return "empty kinds (omit it for the default entry)";
        if (r.kinds?.some((k) => !ALL_KINDS.includes(k))) return "unknown diagram kind";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("have a body of sensible length in reference style", () => {
    expect(
      offenders((r) => {
        const body = r.body.trim();
        if (body.length < 30) return "body shorter than 30 characters";
        if (body.length > 700) return `body longer than 700 characters (${body.length})`;
        if (/\b(you|your|you're|we|our)\b/i.test(body)) return "body addresses the reader; use reference style";
        if (/\p{Extended_Pictographic}/u.test(body)) return "emoji in body";
        if (/!\s|!$/.test(body.replace(/`[^`]*`/g, ""))) return "exclamation mark in prose";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("have a one-line signature and a known link", () => {
    const links = new Set<string>(Object.values(LINKS));
    expect(
      offenders((r) => {
        if (r.signature !== undefined && (!r.signature.trim() || r.signature.includes("\n"))) return "signature must be one non-empty line";
        if (r.link !== undefined && !links.has(r.link)) return `link not in LINKS: ${r.link}`;
        return undefined;
      }),
    ).toEqual([]);
  });

  it("have an example, balanced when it is a whole diagram", () => {
    expect(
      offenders((r) => {
        if (r.example === undefined) return "no example";
        if (!r.example.trim()) return "empty example";
        if (r.example.length > 600) return "example longer than 600 characters";
        const starts = r.example.match(/^\s*@start(\w+)/gm) ?? [];
        const ends = r.example.match(/^\s*@end(\w+)/gm) ?? [];
        if (starts.length !== ends.length) return "unbalanced @start/@end";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("do not define the same term twice for the same diagram kind", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const r of records) {
      for (const term of r.terms) {
        for (const kind of r.kinds ?? ["(default)"]) {
          const key = `${normalizeTerm(term)} @ ${kind}`;
          if (seen.has(key)) clashes.push(key);
          seen.set(key, label(r));
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
