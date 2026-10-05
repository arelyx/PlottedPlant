import type { DiagramKind } from "./types";
import type { Analysis } from "./analysis";
import { dialectKeywords } from "./dialects";
import { openersFor } from "./facts";
import { labelColonIndex } from "./lines";
import { parseRelation, readOperand } from "./relations";
import { vocab } from "../vocab";

/**
 * What the cursor position calls for. Completion offers items per context;
 * "none" means free text (labels, note bodies, comments, new names) where a
 * popup would only get in the way.
 *
 * `start` is the column where the text being completed begins, so an accepted
 * item replaces exactly what was typed.
 */
export type CompletionContext =
  | { kind: "none" }
  /** Outside any block: diagram starters. */
  | { kind: "top"; start: number }
  /** After `@`: start/end tags (and timing participants). */
  | { kind: "tag"; start: number; block: number }
  /** First word of a statement. */
  | { kind: "line-start"; start: number; block: number }
  /** A declared name is expected. `opener` is the delimiter already typed. */
  | { kind: "name"; start: number; block: number; opener: "" | "[" | "(" | "{" | "|"; only?: "task" | "resource" | "swimlane" }
  | { kind: "arrow"; start: number; block: number }
  /** Words that continue a statement: after `note`, `hide`, a Gantt task, ... */
  | { kind: "continuation"; start: number; block: number; after: "note" | "note-side" | "hide" | "gantt-task" | "nwdiag-attribute" | "class-declaration" }
  | { kind: "skinparam-name"; start: number; prefix: string[] }
  /** Value of a skinparam or style property. */
  | { kind: "value"; start: number; name: string }
  /** A colour name; `start` is just after the `#` when one was typed. */
  | { kind: "color"; start: number }
  | { kind: "directive"; start: number }
  | { kind: "theme"; start: number }
  | { kind: "include"; start: number }
  | { kind: "pragma"; start: number }
  | { kind: "builtin"; start: number }
  | { kind: "preprocessor"; start: number; sprite: boolean }
  | { kind: "icon"; start: number }
  | { kind: "emoji"; start: number }
  | { kind: "stereotype"; start: number }
  | { kind: "creole"; start: number }
  | { kind: "style"; start: number; depth: number };

const NONE: CompletionContext = { kind: "none" };

const RELATIONAL = new Set<DiagramKind>([
  "sequence", "class", "object", "er", "state", "usecase", "component", "deployment", "archimate", "timing", "chen",
  "nwdiag", "unknown", "other",
]);

const keywordCache = new Map<DiagramKind, Set<string>>();

/** Words that start a statement in this dialect (so `word ` is not a name followed by an arrow). */
export function statementKeywords(kind: DiagramKind): Set<string> {
  let set = keywordCache.get(kind);
  if (!set) {
    set = new Set<string>();
    for (const list of [openersFor(kind), dialectKeywords(kind), vocab.keywords, vocab.types]) {
      for (const entry of list) set.add(entry.split(/\s/)[0].toLowerCase());
    }
    keywordCache.set(kind, set);
  }
  return set;
}

function inlineContext(before: string, column: number, freeText: boolean): CompletionContext | undefined {
  let m = /<&([\w-]*)$/.exec(before);
  if (m) return { kind: "icon", start: column - m[1].length };
  m = /<:([\w+-]*)$/.exec(before);
  if (m) return { kind: "emoji", start: column - m[1].length };
  m = /<(\$\w*)$/.exec(before);
  if (m) return { kind: "preprocessor", start: column - m[1].length, sprite: true };
  m = /(?<![\w%])(%\w*)$/.exec(before);
  if (m) return { kind: "builtin", start: column - m[1].length };
  m = /(?<![\w$])(\$\w*)$/.exec(before);
  if (m) return { kind: "preprocessor", start: column - m[1].length, sprite: false };
  m = /<(?:color|back):#?(\w*)$/i.exec(before);
  if (m) return { kind: "color", start: column - m[1].length };
  if (!freeText) {
    m = /(?<![\w&#])#(\w*)$/.exec(before);
    if (m) return { kind: "color", start: column - m[1].length };
  }
  return undefined;
}

function hasOpenQuote(text: string): boolean {
  let open = false;
  for (const ch of text) if (ch === '"') open = !open;
  return open;
}

/** True when the cursor sits in the free-text part of a statement (after the label colon, inside an activity). */
function inLabel(before: string, kind: DiagramKind): boolean {
  const trimmed = before.trimStart();
  if (kind === "activity") return /^(?:#\w+)?:/.test(trimmed) || /^(?:->|-\[[^\]]*\]->)/.test(trimmed);
  if (kind === "mindmap" || kind === "wbs") return /^(?:[*+-]+|#+)/.test(trimmed);
  if (kind === "gantt" || kind === "nwdiag" || kind === "chen") return false;
  // `:Actor Name:` is a name, not a label separator.
  const masked = before.replace(/(^|[\s>.\-(])(:[^:\s][^:]*:)/g, (_all, lead: string, actor: string) => lead + "_".repeat(actor.length));
  return labelColonIndex(masked) >= 0;
}

function styleContext(before: string, column: number, depth: number): CompletionContext {
  const selector = /^\s*([\w.]*)$/.exec(before);
  if (selector) return { kind: "style", start: column - selector[1].length, depth };
  const value = /^\s*(\w+)\s+(\S*)$/.exec(before);
  if (value) return { kind: "value", start: column - value[2].length, name: value[1] };
  return NONE;
}

const NOTE_TARGET = /^(?:floating\s+)?[hr]?note\s+(?:(?:left|right|top|bottom)\s+of|over)\s+(?:[^:,]+,\s*)*([\p{L}\p{N}_.]*)$/iu;
const NOTE_SIDE = /^(?:floating\s+)?[hr]?note\s+(?:left|right|top|bottom)\s+(\w*)$/i;
const NOTE_WORD = /^(?:floating\s+)?[hr]?note\s+(\w*)$/i;
const LIFELINE = /^(?:activate|deactivate|destroy|create)\s+([\p{L}\p{N}_.]*)$/iu;
const REF_OVER = /^ref\s+over\s+(?:[^:,]+,\s*)*([\p{L}\p{N}_.]*)$/iu;
const INHERITS = /\b(?:extends|implements)\s+(?:[\p{L}\p{N}_.]+\s*,\s*)*([\p{L}\p{N}_.]*)$/iu;
const CLASS_DECLARED = /^(?:abstract\s+class|abstract|class|interface|enum|annotation|struct|entity|exception)\s+[\p{L}\p{N}_.]+(?:<[^>]*>)?\s+(\w*)$/iu;

/** Classify the cursor position (0-based line and column). */
export function completionContext(analysis: Analysis, line: number, column: number): CompletionContext {
  const info = analysis.lineInfo[line];
  const text = analysis.lines[line] ?? "";
  const before = text.slice(0, column);
  if (!info) return NONE;
  const trimmed = before.trimStart();
  const indent = before.length - trimmed.length;

  if (info.mode === "comment") return NONE;
  if (info.mode === "outside") {
    if (/^@\w*$/.test(trimmed)) return { kind: "tag", start: indent, block: -1 };
    if (/^[\w-]*$/.test(trimmed)) return { kind: "top", start: indent };
    return NONE;
  }
  if (info.mode === "tag") {
    return /^@\w*$/.test(trimmed) ? { kind: "tag", start: indent, block: info.block } : NONE;
  }

  const block = info.block;
  const kind = analysis.blocks[block]?.kind ?? "unknown";
  const freeText = info.mode === "text" || info.mode === "data" || info.mode === "members";
  const label = info.mode === "code" && !trimmed.startsWith("!") && !/^skinparam\b/i.test(trimmed) && inLabel(before, kind);
  const inline = inlineContext(before, column, freeText || label);
  if (inline) return inline;

  if (info.mode === "text") {
    const tag = /<(\w*)$/.exec(before);
    return tag ? { kind: "creole", start: column - tag[1].length - 1 } : NONE;
  }
  if (info.mode === "data" || info.mode === "members") return NONE;
  if (info.mode === "style") return styleContext(before, column, info.styleDepth ?? 0);
  if (info.mode === "skinparam") {
    const name = /^\s*(\w*)$/.exec(before);
    if (name) return { kind: "skinparam-name", start: column - name[1].length, prefix: info.skinPrefix ?? [] };
    const value = /^\s*(\w+)(?:<<[^>]*>>)?\s+(\S*)$/.exec(before);
    if (value) return { kind: "value", start: column - value[2].length, name: (info.skinPrefix ?? []).join("") + value[1] };
    return NONE;
  }

  // Statements and directives.
  if (trimmed.startsWith("!")) {
    let m = /^!(\w*)$/.exec(trimmed);
    if (m) return { kind: "directive", start: indent };
    m = /^!theme\s+([\w-]*)$/i.exec(trimmed);
    if (m) return { kind: "theme", start: column - m[1].length };
    m = /^!include\w*\s+<([^>]*)$/i.exec(trimmed);
    if (m) return { kind: "include", start: column - m[1].length };
    m = /^!pragma\s+(\w*)$/i.exec(trimmed);
    if (m) return { kind: "pragma", start: column - m[1].length };
    return NONE;
  }
  if (/^@\w*$/.test(trimmed)) return { kind: "tag", start: indent, block };

  let m = /^skinparam\s+(\w*)$/i.exec(trimmed);
  if (m) return { kind: "skinparam-name", start: column - m[1].length, prefix: [] };
  m = /^skinparam\s+(\w+)(?:<<[^>]*>>)?\s+(\S*)$/i.exec(trimmed);
  if (m) return { kind: "value", start: column - m[2].length, name: m[1] };

  if (hasOpenQuote(before)) return NONE;
  m = /<<([^<>]*)$/.exec(before);
  if (m && !label) return { kind: "stereotype", start: column - m[1].length };
  if (label) {
    const tag = /<(\w*)$/.exec(before);
    return tag ? { kind: "creole", start: column - tag[1].length - 1 } : NONE;
  }

  if (kind === "gantt" || kind === "chronology") {
    m = /(?<!\[)\[([^[\]]*)$/.exec(before);
    if (m) return { kind: "name", start: column - m[1].length, block, opener: "[", only: "task" };
    m = /\{([^{}]*)$/.exec(before);
    if (m) return { kind: "name", start: column - m[1].length, block, opener: "{", only: "resource" };
    m = /^(?:then\s+)?\[[^\]]+\](?:\s+as\s+\[[^\]]+\])?\s+(\w*)$/i.exec(trimmed);
    if (m) return { kind: "continuation", start: column - m[1].length, block, after: "gantt-task" };
    m = /\b(?:at|after|before)\s+(\w*)$/i.exec(trimmed);
    if (m && /^\[/.test(trimmed)) return { kind: "name", start: column - m[1].length, block, opener: "", only: "task" };
    // "[Task] is colored in Coral" and the fill/line form "Coral/Black" take bare colour names.
    m = /\bcolou?red\s+in\s+(?:#?\w+\/)?(\w*)$/i.exec(trimmed);
    if (m) return { kind: "color", start: column - m[1].length };
  }
  if (kind === "activity") {
    m = /^\|(?:#\w+\|)?([^|]*)$/.exec(trimmed);
    if (m) return { kind: "name", start: column - m[1].length, block, opener: "|", only: "swimlane" };
  }
  if (kind === "nwdiag") {
    m = /^[\w-]+\s*\[(?:[^\]]*,)?\s*(\w*)$/.exec(trimmed);
    if (m) return { kind: "continuation", start: column - m[1].length, block, after: "nwdiag-attribute" };
  }

  if (kind === "usecase" || kind === "component" || kind === "deployment" || kind === "archimate") {
    m = /^([[(])([^\])]*)$/.exec(trimmed);
    if (m) return { kind: "name", start: column - m[2].length, block, opener: m[1] === "[" ? "[" : "(" };
  }

  if (/^[\p{L}\p{N}_.]*$/u.test(trimmed)) return { kind: "line-start", start: indent, block };
  if (kind === "mindmap" || kind === "wbs") return NONE;

  m = NOTE_TARGET.exec(trimmed);
  if (m) return { kind: "name", start: column - m[1].length, block, opener: "" };
  m = NOTE_SIDE.exec(trimmed);
  if (m) return { kind: "continuation", start: column - m[1].length, block, after: "note-side" };
  m = NOTE_WORD.exec(trimmed);
  if (m) return { kind: "continuation", start: column - m[1].length, block, after: "note" };
  m = /^(?:hide|show)\s+(\w*)$/i.exec(trimmed);
  if (m) return { kind: "continuation", start: column - m[1].length, block, after: "hide" };
  if (kind === "sequence") {
    m = LIFELINE.exec(trimmed) ?? REF_OVER.exec(trimmed);
    if (m) return { kind: "name", start: column - m[1].length, block, opener: "" };
  }
  if (kind === "class" || kind === "object" || kind === "er") {
    m = INHERITS.exec(trimmed);
    if (m) return { kind: "name", start: column - m[1].length, block, opener: "" };
    m = CLASS_DECLARED.exec(trimmed);
    if (m) return { kind: "continuation", start: column - m[1].length, block, after: "class-declaration" };
  }

  if (!RELATIONAL.has(kind) && kind !== "activity-legacy" && kind !== "gantt") return NONE;

  // A statement that opens with a keyword is not a relation: `participant Foo `, `title My `.
  const firstWord = /^([\p{L}_][\p{L}\p{N}_]*)(?=\s)/u.exec(trimmed);
  if (firstWord && statementKeywords(kind).has(firstWord[1].toLowerCase())) {
    const declared = analysis.symbols.some((s) => s.block === block && s.name === firstWord[1] && s.category !== "structure");
    if (!declared) return NONE;
  }

  const relation = parseRelation(before);
  if (relation && (relation.left.length > 0 || relation.openLeft)) {
    if (relation.right.length === 0 && !relation.openRight) {
      if (relation.arrow.end === before.length) return { kind: "arrow", start: relation.arrow.start, block };
      const typed = before.slice(relation.arrow.end).trimStart();
      const opener = typed === "[" || typed === "(" ? typed : "";
      if (typed === "" || opener) return { kind: "name", start: column, block, opener };
      return NONE;
    }
    const last = relation.right[relation.right.length - 1];
    if (last && last.outerEnd === before.length && last.delimiter === "") return { kind: "name", start: last.start, block, opener: "" };
    return NONE;
  }

  // `Name ` (a name, then whitespace): an arrow comes next.
  const operand = readOperand(before, indent);
  if (operand && operand.outerEnd < before.length && before.slice(operand.outerEnd).trim() === "") {
    return { kind: "arrow", start: column, block };
  }
  return NONE;
}
