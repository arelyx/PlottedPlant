/**
 * Lint diagnostics that the rendering engine does not give, or gives badly.
 *
 * The rule for everything here is: never flag valid PlantUML. The engine
 * already reports hard syntax errors, so a missed problem costs little while
 * a false alarm teaches people to ignore the squiggles. Hence:
 * - structural checks come from the structure model and are dropped for any
 *   block the model is unsure about;
 * - the "unknown name" checks are typo detectors: a name is only flagged when
 *   it is not valid AND a valid name is one or two edits away. PlantUML's own
 *   skinparam list is incomplete, so "not in the list" alone proves nothing.
 */
import { vocab } from "../vocab";
import { colorNames, documentColors } from "./colors";
import type { TextEdit } from "./format";
import { analyzeStructure, type DocumentStructure, type StructureBlock } from "./structure";
import type { Range } from "./types";

export type DiagnosticCode =
  | "missing-end-tag"
  | "nested-start-tag"
  | "mismatched-end-tag"
  | "stray-end-tag"
  | "content-after-end"
  | "unclosed-block"
  | "stray-closer"
  | "stray-branch"
  | "unknown-skinparam"
  | "unknown-color"
  | "unknown-theme"
  | "unknown-directive";

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface QuickFix {
  title: string;
  edits: TextEdit[];
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  range: Range;
  /** Render faded: the text has no effect. */
  unnecessary?: boolean;
  fixes: QuickFix[];
}

export interface DiagnosticOptions {
  /** Line of the local cursor: the construct being typed there is reported as a hint, not a warning. */
  cursorLine?: number;
  structure?: DocumentStructure;
}

/** Codes that explain a failure the engine reports too, on the same line. */
export const ENGINE_OVERLAP_CODES: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  "unclosed-block",
  "stray-closer",
  "stray-branch",
  "unknown-color",
  "unknown-theme",
  "unknown-directive",
]);

function lineRange(line: number, startColumn: number, endColumn: number): Range {
  return { startLine: line, startColumn, endLine: line, endColumn };
}

function indentOf(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

/** Optimal-string-alignment distance (a swap of neighbours counts once), capped at `limit + 1`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previous2[j - 2] + 1);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[b.length];
}

/** How many edits a name of this length may be from a valid one and still count as a typo of it. */
function typoLimit(length: number): number {
  return length <= 3 ? 0 : length <= 5 ? 1 : 2;
}

/** The candidates closest to `word` within the typo limit: usually one, several on a tie, none if nothing is close. */
function closestAll(word: string, candidates: Iterable<string>): string[] {
  const limit = typoLimit(word.length);
  if (limit === 0) return [];
  const lower = word.toLowerCase();
  let best: string[] = [];
  let bestDistance = limit + 1;
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase(), limit);
    if (distance === 0) return [];
    if (distance < bestDistance) {
      best = [candidate];
      bestDistance = distance;
    } else if (distance === bestDistance && distance <= limit && !best.includes(candidate)) {
      best.push(candidate);
    }
  }
  return best.slice(0, 3);
}

function closest(word: string, candidates: Iterable<string>): string | undefined {
  return closestAll(word, candidates)[0];
}

/** `"a"`, `"a" or "b"`, `"a", "b" or "c"`. */
function quoteList(words: readonly string[]): string {
  const quoted = words.map((word) => `"${word}"`);
  return quoted.length <= 1 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Skinparams

/** The key the engine stores a skinparam under: lower case, `_` and `.` dropped, a few prefixes folded. */
function skinparamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/<<.*?>>/g, "")
    .replace(/[_.]/g, "")
    .replace(/sequence(participant|actor)/, "$1")
    .replace(/(activity|class|component|object|sequence|state|usecase)arrow/, "arrow")
    .replace(/align$/, "alignment");
}

/** Property suffixes the engine derives for any element, longest first. */
const SKINPARAM_PROPERTIES = [
  "StereotypeFontColor",
  "StereotypeFontName",
  "StereotypeFontSize",
  "StereotypeFontStyle",
  "BackgroundColor",
  "BorderThickness",
  "DiagonalCorner",
  "TextAlignment",
  "BorderColor",
  "BorderStyle",
  "RoundCorner",
  "FontColor",
  "FontStyle",
  "Alignment",
  "Shadowing",
  "Thickness",
  "FontName",
  "FontSize",
  "Padding",
  "Color",
  "Style",
];

/** Element prefixes that are valid but appear in no listed skinparam. */
const EXTRA_SKINPARAM_ELEMENTS = [
  "Arrow",
  "Boundary",
  "Cloud",
  "Collections",
  "Control",
  "Database",
  "Entity",
  "Enum",
  "File",
  "Folder",
  "Frame",
  "Interface",
  "Label",
  "Legend",
  "Node",
  "Package",
  "Partition",
  "Participant",
  "Rectangle",
  "Sequence",
  "SequenceBox",
  "SequenceDivider",
  "SequenceGroup",
  "SequenceGroupHeader",
  "SequenceLifeLine",
  "SequenceReference",
  "SequenceReferenceHeader",
  "SequenceTitle",
  "Stack",
  "State",
  "StateStart",
  "StateEnd",
  "Stereotype",
  "ActivityStart",
  "ActivityEnd",
  "ActivityBar",
  "ActivityDiamond",
  "StereotypeA",
  "StereotypeC",
  "StereotypeE",
  "StereotypeI",
  "StereotypeN",
  "Storage",
  "Swimlane",
  "SwimlaneTitle",
  "Title",
  "Usecase",
  "UsecaseActor",
];

/** Skinparams the engine reads by name that its published list leaves out. */
const EXTRA_SKINPARAMS = [
  "ActivityShape",
  "ActorStyle",
  "FootBox",
  "GroupInheritance",
  "LifelineStrategy",
  "Mode",
  "ReverseColor",
  "SequenceMessageBackgroundColor",
  "SequenceMessageBorderColor",
  "StateDiagramEdgeLabelStyle",
  "StereotypeAlignment",
  "SvgDimensionStyle",
  "Swimlane",
  "Swimlanes",
  "TikzFont",
  "TopUrl",
  "UseBetaStyle",
  "WidthWarning",
  "WrapMessageWidth",
];

interface SkinparamTables {
  /** Engine key → name as listed. */
  known: Map<string, string>;
  /** Lower-case element prefix → canonical spelling. */
  elements: Map<string, string>;
}

let skinparamTables: SkinparamTables | undefined;

function splitProperty(key: string): { prefix: string; property: string } | undefined {
  for (const property of SKINPARAM_PROPERTIES) {
    if (key.endsWith(property.toLowerCase())) return { prefix: key.slice(0, -property.length), property };
  }
  return undefined;
}

function getSkinparamTables(): SkinparamTables {
  if (skinparamTables) return skinparamTables;
  const known = new Map<string, string>();
  const elements = new Map<string, string>([["", ""]]);
  for (const name of [...vocab.skinparams, ...EXTRA_SKINPARAMS]) {
    const key = skinparamKey(name);
    known.set(key, name);
    const split = splitProperty(name.toLowerCase());
    if (split) elements.set(split.prefix, name.slice(0, split.prefix.length));
  }
  for (const type of vocab.types) elements.set(type.toLowerCase(), type[0].toUpperCase() + type.slice(1));
  for (const element of EXTRA_SKINPARAM_ELEMENTS) elements.set(element.toLowerCase(), element);
  skinparamTables = { known, elements };
  return skinparamTables;
}

/**
 * A corrected spelling for a skinparam name that is not valid but is a near
 * miss of one that is; undefined for valid names and for names that resemble
 * nothing known (which may well be valid: the engine's list is incomplete).
 */
export function suggestSkinparam(name: string): string | undefined {
  if (/[$%]/.test(name) || name.includes("##")) return undefined;
  const { known, elements } = getSkinparamTables();
  const key = skinparamKey(name);
  if (key === "" || known.has(key)) return undefined;
  const split = splitProperty(key);
  if (split && elements.has(split.prefix)) return undefined;

  const candidates = new Map<string, string>(known);
  if (split) {
    // Right property, misspelt element: `clasBackgroundColor`.
    for (const [element, spelling] of elements) {
      if (split.prefix.length >= 4 && editDistance(split.prefix, element, 1) === 1) {
        candidates.set(element + split.property.toLowerCase(), spelling + split.property);
      }
    }
  } else {
    // Right element, misspelt property: `classBackgroundColr`.
    for (const [element, spelling] of elements) {
      if (!key.startsWith(element)) continue;
      const rest = key.slice(element.length);
      for (const property of SKINPARAM_PROPERTIES) {
        if (editDistance(rest, property.toLowerCase(), 2) <= 2) {
          candidates.set(element + property.toLowerCase(), spelling + property);
        }
      }
    }
  }
  const match = closest(key, candidates.keys());
  if (match === undefined) return undefined;
  const suggestion = candidates.get(match)!;
  // Keep the caller's casing habit for the first letter (`classFontColor` vs `ClassFontColor`).
  return /^[a-z]/.test(name) ? suggestion[0].toLowerCase() + suggestion.slice(1) : suggestion;
}

const SKINPARAM_NAME = "[\\w.]*(?:<<[^<>]*>>)?[\\w.]*";

function skinparamDiagnostics(lines: readonly string[], structure: DocumentStructure, out: Diagnostic[]): void {
  /** `written` is the name on the line; `prefix` is what enclosing `name {` lines put in front of it. */
  const report = (line: number, column: number, written: string, prefix: string) => {
    // `BackgroundColor<<Stereo>>` checks as `BackgroundColor`; a stereotype in the middle is left alone.
    const stereotype = written.indexOf("<<");
    if (stereotype >= 0 && !written.endsWith(">>")) return;
    const name = stereotype < 0 ? written : written.slice(0, stereotype);
    const suggestion = suggestSkinparam(prefix + name);
    // The fix can only rewrite this line, so the correction has to lie in its part of the composed name.
    if (!suggestion || suggestion.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return;
    const text = suggestion.slice(prefix.length);
    const range = lineRange(line, column, column + name.length);
    out.push({
      code: "unknown-skinparam",
      severity: "warning",
      message: `Unknown skinparam "${prefix + name}" (PlantUML ignores it). Did you mean "${suggestion}"?`,
      range,
      fixes: [{ title: `Change to "${text}"`, edits: [{ range, text }] }],
    });
  };

  const single = new RegExp(`^(\\s*skinparam(?:locked)?\\s+)(${SKINPARAM_NAME})\\s+[^{}]*$`, "i");
  const nestedOpen = new RegExp(`^\\s*(?:skinparam(?:locked)?\\s*)?(${SKINPARAM_NAME})\\s*\\{$`, "i");
  const nestedEntry = new RegExp(`^(\\s*)(${SKINPARAM_NAME})\\s+\\S`);

  lines.forEach((text, line) => {
    const info = structure.lines[line];
    if (info.role !== "code" || structure.blocks[info.block]?.dialect !== "uml") return;
    const match = single.exec(text);
    if (match && match[2] !== "") report(line, match[1].length, match[2], "");
  });

  for (const construct of structure.constructs) {
    if (construct.kind !== "skinparam" || construct.closeLine < 0) continue;
    const prefixes = [nestedOpen.exec(lines[construct.openLine].trimEnd())?.[1] ?? ""];
    for (let line = construct.openLine + 1; line < construct.closeLine; line++) {
      const text = lines[line];
      const trimmed = text.trim();
      if (trimmed === "" || trimmed.startsWith("'") || trimmed.startsWith("!") || trimmed.startsWith("/'")) continue;
      if (trimmed === "}") {
        prefixes.pop();
        continue;
      }
      const open = nestedOpen.exec(text.trimEnd());
      if (open) {
        prefixes.push(open[1]);
        continue;
      }
      const entry = nestedEntry.exec(text);
      if (!entry || entry[2] === "") continue;
      report(line, entry[1].length, entry[2], prefixes.join("").replace(/<<[^<>]*>>/g, ""));
    }
  }
}

// ---------------------------------------------------------------------------
// Colours, themes, directives

/** Names given a meaning by `!define NAME …`: text substitution can make any bare word valid. */
function definedNames(lines: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const text of lines) {
    const define = /^\s*!define(?:long)?\s+([\p{L}_][\p{L}\d_]*)/u.exec(text);
    if (define) names.add(define[1]);
  }
  return names;
}

function colorDiagnostics(lines: readonly string[], structure: DocumentStructure, out: Diagnostic[]): void {
  const defined = definedNames(lines);
  for (const token of documentColors(lines, structure)) {
    if (token.hex !== null) continue;
    const name = token.text.replace(/^#/, "");
    if (defined.has(name) || structure.blocks[structure.lines[token.line].block]?.external) continue;
    const suggestions = closestAll(name, colorNames);
    if (suggestions.length === 0) continue;
    // Keep the caller's casing habit: `#lightgren` → `#lightgreen`, `#LightGren` → `#LightGreen`.
    const spellings = suggestions.map((suggestion) =>
      name === name.toLowerCase()
        ? suggestion
        : (vocab.colors.find((color) => color.toLowerCase() === suggestion) ?? suggestion),
    );
    const range = lineRange(token.line, token.start, token.end);
    out.push({
      code: "unknown-color",
      severity: "warning",
      message: `Unknown colour "${name}". Did you mean ${quoteList(spellings)}?`,
      range,
      fixes: spellings.map((spelling) => {
        const text = (token.text.startsWith("#") ? "#" : "") + spelling;
        return { title: `Change to "${text}"`, edits: [{ range, text }] };
      }),
    });
  }
}

/** Directive words the engine accepts beyond its published list. */
const EXTRA_DIRECTIVES = [
  "assume",
  "elseif",
  "final",
  "global",
  "include_many",
  "include_once",
  "include_sprites",
  "includeurl",
  "memory_dump",
  "unquoted",
];

function directiveDiagnostics(lines: readonly string[], structure: DocumentStructure, out: Diagnostic[]): void {
  const directives = [...vocab.preprocessor, ...EXTRA_DIRECTIVES];
  const known = new Set(directives.map((word) => word.toLowerCase()));
  lines.forEach((text, line) => {
    const info = structure.lines[line];
    if (info.role !== "code" || structure.blocks[info.block]?.dialect !== "uml") return;

    const theme = /^(\s*!theme\s+)([\w-]+)\s*$/i.exec(text);
    if (theme && !vocab.themes.includes(theme[2])) {
      const suggestion = closest(theme[2], vocab.themes) ?? vocab.themes.find((name) => name === theme[2].toLowerCase());
      if (suggestion) {
        const range = lineRange(line, theme[1].length, theme[1].length + theme[2].length);
        out.push({
          code: "unknown-theme",
          severity: "warning",
          message: `Unknown theme "${theme[2]}". Did you mean "${suggestion}"?`,
          range,
          fixes: [{ title: `Change to "${suggestion}"`, edits: [{ range, text: suggestion }] }],
        });
      }
      return;
    }

    // `!name = value` is a variable assignment, not a directive.
    const directive = /^(\s*!)([A-Za-z_]+)(?!\w)(?!\s*\??=)/.exec(text);
    if (!directive) return;
    const word = directive[2].toLowerCase();
    if (known.has(word) || word.startsWith("include")) return;
    const suggestion = closest(word, directives);
    if (!suggestion) return;
    const range = lineRange(line, directive[1].length - 1, directive[1].length + directive[2].length);
    out.push({
      code: "unknown-directive",
      severity: "warning",
      message: `Unknown preprocessor directive "!${directive[2]}". Did you mean "!${suggestion}"?`,
      range,
      fixes: [{ title: `Change to "!${suggestion}"`, edits: [{ range, text: `!${suggestion}` }] }],
    });
  });
}

// ---------------------------------------------------------------------------
// @start / @end pairing

function tagRange(lines: readonly string[], line: number): Range {
  const text = lines[line];
  const start = text.indexOf("@");
  const end = start + (/^@\w+/.exec(text.slice(start))?.[0].length ?? 1);
  return lineRange(line, start, end);
}

function lastContentLine(lines: readonly string[], from: number, to: number): number {
  let line = to;
  while (line > from && lines[line].trim() === "") line--;
  return line;
}

/** Edit that adds `text` as a new line after `line`. */
function insertLineAfter(lines: readonly string[], line: number, text: string): TextEdit {
  return { range: lineRange(line, lines[line].length, lines[line].length), text: `\n${text}` };
}

function deleteLine(lines: readonly string[], line: number): TextEdit {
  if (line + 1 < lines.length) return { range: { startLine: line, startColumn: 0, endLine: line + 1, endColumn: 0 }, text: "" };
  if (line === 0) return { range: lineRange(0, 0, lines[0].length), text: "" };
  return {
    range: { startLine: line - 1, startColumn: lines[line - 1].length, endLine: line, endColumn: lines[line].length },
    text: "",
  };
}

function tagDiagnostics(lines: readonly string[], structure: DocumentStructure, out: Diagnostic[]): void {
  structure.blocks.forEach((block, index) => {
    if (block.implicit) return;
    const startTag = `@start${block.tag}`;
    const endTag = `@end${block.tag}`;
    if (block.closedBy === "eof") {
      const last = lastContentLine(lines, block.startLine, block.endLine);
      out.push({
        code: "missing-end-tag",
        severity: "warning",
        message: `"${startTag}" is never closed with "${endTag}".`,
        range: tagRange(lines, block.startLine),
        fixes: [{ title: `Add "${endTag}"`, edits: [insertLineAfter(lines, last, endTag)] }],
      });
    } else if (block.closedBy === "start") {
      const next = structure.blocks[index + 1];
      const last = lastContentLine(lines, block.startLine, block.endLine);
      out.push({
        code: "nested-start-tag",
        severity: "warning",
        message: `"@start${next.tag}" begins before the "${startTag}" block on line ${block.startLine + 1} is closed with "${endTag}".`,
        range: tagRange(lines, next.startLine),
        fixes: [{ title: `Add "${endTag}" before this block`, edits: [insertLineAfter(lines, last, endTag)] }],
      });
    } else if (block.endTag !== block.tag) {
      const range = tagRange(lines, block.endLine);
      out.push({
        code: "mismatched-end-tag",
        severity: "info",
        message: `"@end${block.endTag}" closes a block opened with "${startTag}"; "${endTag}" is expected.`,
        range,
        fixes: [{ title: `Change to "${endTag}"`, edits: [{ range, text: endTag }] }],
      });
    }
  });

  for (const line of structure.strayEndLines) {
    const tag = /@end\w*/i.exec(lines[line])?.[0] ?? "@end";
    out.push({
      code: "stray-end-tag",
      severity: "warning",
      message: `"${tag}" has no matching "${tag.replace(/@end/i, "@start")}".`,
      range: tagRange(lines, line),
      fixes: [{ title: "Remove this line", edits: [deleteLine(lines, line)] }],
    });
  }

  const lastBlock = structure.blocks[structure.blocks.length - 1];
  if (!lastBlock || lastBlock.implicit || lastBlock.closedBy !== "end") return;
  for (let line = lastBlock.endLine + 1; line < lines.length; line++) {
    const text = lines[line];
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("'") || structure.strayEndLines.includes(line)) continue;
    out.push({
      code: "content-after-end",
      severity: "hint",
      message: `This is after the last "@end${lastBlock.endTag}", so it is not part of any diagram.`,
      range: lineRange(line, text.length - text.trimStart().length, text.trimEnd().length),
      unnecessary: true,
      fixes: [],
    });
  }
}

// ---------------------------------------------------------------------------
// Unclosed and stray constructs

const TEXT_KINDS = new Set(["note", "text", "label", "sprite", "comment", "members", "style", "json", "skinparam"]);

function blockBodyEnd(block: StructureBlock): number {
  return block.closedBy === "end" ? block.endLine : block.endLine + 1;
}

function structureDiagnostics(
  lines: readonly string[],
  structure: DocumentStructure,
  cursorLine: number | undefined,
  out: Diagnostic[],
): void {
  // The innermost unclosed construct around the cursor is most likely still being typed.
  let beingTyped = -1;
  if (cursorLine !== undefined) {
    for (const issue of structure.issues) {
      if (issue.kind !== "unclosed") continue;
      const block = structure.blocks[issue.block];
      if (issue.line > cursorLine || cursorLine >= blockBodyEnd(block) || issue.insertBefore < cursorLine) continue;
      if (beingTyped < 0 || issue.line > structure.constructs[beingTyped].openLine) beingTyped = issue.construct;
    }
  }

  for (const issue of structure.issues) {
    const range = lineRange(issue.line, issue.startColumn, issue.endColumn);
    if (issue.kind === "stray-closer") {
      out.push({
        code: "stray-closer",
        severity: "warning",
        message: `"${issue.keyword}" does not close anything: there is no open ${issue.expected} before it.`,
        range,
        fixes: [{ title: "Remove this line", edits: [deleteLine(lines, issue.line)] }],
      });
      continue;
    }
    if (issue.kind === "stray-branch") {
      out.push({
        code: "stray-branch",
        severity: "warning",
        message: `"${issue.keyword}" is outside any "${issue.expected}" block.`,
        range,
        fixes: [],
      });
      continue;
    }

    const construct = structure.constructs[issue.construct];
    const block = structure.blocks[issue.block];
    // A text body swallows everything after it, so its end is a guess: the paragraph that follows the opener.
    let before = Math.min(issue.insertBefore, blockBodyEnd(block));
    if (TEXT_KINDS.has(construct.kind)) {
      let line = construct.openLine + 1;
      while (line < before && lines[line].trim() !== "") line++;
      before = line;
    }
    const after = lastContentLine(lines, construct.openLine, before - 1);
    const closer = indentOf(lines[construct.openLine]) + construct.closer;
    out.push({
      code: "unclosed-block",
      severity: issue.construct === beingTyped ? "hint" : "warning",
      message: `"${issue.keyword}" opened here is never closed with "${issue.expected}".`,
      range,
      fixes: [{ title: `Add "${construct.closer}"`, edits: [insertLineAfter(lines, after, closer)] }],
    });
  }
}

/** All lint diagnostics for a document. Lines and columns are 0-based. */
export function computeDiagnostics(lines: readonly string[], options: DiagnosticOptions = {}): Diagnostic[] {
  const structure = options.structure ?? analyzeStructure(lines);
  const out: Diagnostic[] = [];
  tagDiagnostics(lines, structure, out);
  structureDiagnostics(lines, structure, options.cursorLine, out);
  skinparamDiagnostics(lines, structure, out);
  colorDiagnostics(lines, structure, out);
  directiveDiagnostics(lines, structure, out);
  return out.sort(
    (a, b) => a.range.startLine - b.range.startLine || a.range.startColumn - b.range.startColumn,
  );
}
