import type { Snippet } from "./types";

/**
 * A snippet plus what is needed to check its expanded body against a real
 * PlantUML server (scripts/validate-plantuml-content.mjs).
 */
export interface SnippetDef extends Snippet {
  /** Validation only: lines placed before the expanded body inside the wrapper. */
  setup?: string;
  /** Validation only: @start tag to wrap in when the scope does not imply it. */
  tag?: string;
  /** Validation only: diagram type the server must report; null disables the check. */
  expect?: string | null;
  /** Validation only: why the sandboxed server cannot check this snippet. */
  skip?: string;
}

export interface SnippetAnalysis {
  /** Body with every tab stop replaced by its default text (first option for choices unless picked otherwise). */
  expanded: string;
  /** Tab stop numbers in order of first appearance. */
  tabStops: number[];
  /** Tab stops (other than $0) that have no default text anywhere in the body. */
  withoutDefault: number[];
  /** Syntax problems: unescaped "$", unterminated placeholders, empty choices. */
  problems: string[];
}

type Node =
  | { type: "text"; value: string }
  | { type: "stop"; index: number; children?: Node[]; choices?: string[] };

/**
 * Parse the subset of VS Code snippet syntax used here: `$1`, `${1}`,
 * `${1:default}` (nestable), `${1|a,b|}`, and the escapes `\$`, `\}`, `\\`.
 * Snippet variables (`$NAME`) are not used, so a `$` that does not start a
 * tab stop is reported: PlantUML's own `$variables` must be written `\$name`.
 */
export function analyzeSnippet(body: string, pickChoice?: (index: number, choices: string[]) => string): SnippetAnalysis {
  const problems: string[] = [];
  let pos = 0;

  const parseUntil = (closing: boolean): Node[] => {
    const nodes: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) nodes.push({ type: "text", value: text });
      text = "";
    };
    while (pos < body.length) {
      const ch = body[pos];
      if (ch === "\\" && pos + 1 < body.length && "$}\\".includes(body[pos + 1])) {
        text += body[pos + 1];
        pos += 2;
      } else if (ch === "}" && closing) {
        flush();
        return nodes;
      } else if (ch === "$") {
        const simple = /^\$(\d+)/.exec(body.slice(pos));
        const open = /^\$\{(\d+)/.exec(body.slice(pos));
        if (simple) {
          flush();
          nodes.push({ type: "stop", index: Number(simple[1]) });
          pos += simple[0].length;
        } else if (open) {
          flush();
          pos += open[0].length;
          nodes.push(parseBraced(Number(open[1])));
        } else {
          problems.push(`unescaped "$" at offset ${pos}`);
          text += ch;
          pos++;
        }
      } else {
        text += ch;
        pos++;
      }
    }
    flush();
    if (closing) problems.push("unterminated placeholder");
    return nodes;
  };

  const parseBraced = (index: number): Node => {
    const next = body[pos];
    if (next === "}") {
      pos++;
      return { type: "stop", index };
    }
    if (next === ":") {
      pos++;
      const children = parseUntil(true);
      pos++;
      return { type: "stop", index, children };
    }
    if (next === "|") {
      const end = body.indexOf("|}", pos + 1);
      if (end === -1) {
        problems.push(`unterminated choice for tab stop ${index}`);
        pos = body.length;
        return { type: "stop", index };
      }
      const choices = body
        .slice(pos + 1, end)
        .split(/(?<!\\),/)
        .map((c) => c.replace(/\\([,|$}\\])/g, "$1"));
      if (choices.some((c) => c === "")) problems.push(`empty choice for tab stop ${index}`);
      pos = end + 2;
      return { type: "stop", index, choices };
    }
    problems.push(`malformed placeholder for tab stop ${index}`);
    return { type: "stop", index };
  };

  const nodes = parseUntil(false);

  const defaults = new Map<number, string>();
  const tabStops: number[] = [];
  const render = (list: Node[], resolveMirrors: boolean): string =>
    list
      .map((node) => {
        if (node.type === "text") return node.value;
        if (!tabStops.includes(node.index)) tabStops.push(node.index);
        if (node.choices) {
          const chosen = pickChoice?.(node.index, node.choices) ?? node.choices[0];
          if (!defaults.has(node.index)) defaults.set(node.index, chosen);
          return chosen;
        }
        if (node.children) {
          const value = render(node.children, resolveMirrors);
          if (!defaults.has(node.index)) defaults.set(node.index, value);
          return value;
        }
        return resolveMirrors ? (defaults.get(node.index) ?? "") : "";
      })
      .join("");

  // First pass collects defaults so that a mirror may precede its definition.
  render(nodes, false);
  const expanded = render(nodes, true);
  const withoutDefault = tabStops.filter((n) => n !== 0 && !defaults.has(n));
  return { expanded, tabStops, withoutDefault, problems };
}

/** The text a snippet inserts when every tab stop keeps its default. */
export function expandSnippet(body: string): string {
  return analyzeSnippet(body).expanded;
}

/**
 * The default expansion followed by one expansion per non-default option of
 * each choice placeholder (one choice varied at a time), so that validation
 * covers every option a user can pick.
 */
export function expandSnippetVariants(body: string): string[] {
  const options = new Map<number, string[]>();
  const base = analyzeSnippet(body, (index, choices) => {
    if (!options.has(index)) options.set(index, choices);
    return choices[0];
  }).expanded;
  const variants = [base];
  for (const [index, choices] of options) {
    for (const option of choices.slice(1)) {
      variants.push(analyzeSnippet(body, (i, list) => (i === index ? option : list[0])).expanded);
    }
  }
  return [...new Set(variants)];
}
