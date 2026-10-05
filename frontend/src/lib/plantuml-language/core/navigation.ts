import type { DiagramKind, Range } from "./types";
import { type Analysis, occurrenceAt } from "./analysis";
import { kindLabel } from "./render";
import type { Occurrence, PumlSymbol, SymbolCategory } from "./symbols";

function occurrenceRange(occ: Occurrence): Range {
  return { startLine: occ.line, startColumn: occ.startColumn, endLine: occ.line, endColumn: occ.endColumn };
}

function renameable(symbol: PumlSymbol): boolean {
  return symbol.category !== "structure";
}

/** Whether other statements can refer to the symbol by name (so two of them must not share one). */
function referable(symbol: PumlSymbol): boolean {
  return symbol.category !== "structure" && symbol.category !== "member" && symbol.category !== "enumMember" && symbol.category !== "parameter";
}

function symbolAtCursor(analysis: Analysis, line: number, column: number): { symbol: PumlSymbol; occurrence: Occurrence } | undefined {
  const occurrence = occurrenceAt(analysis, line, column);
  if (!occurrence) return undefined;
  const symbol = analysis.symbols[occurrence.symbol];
  return renameable(symbol) ? { symbol, occurrence } : undefined;
}

/** Where the symbol under the cursor is declared. */
export function definition(analysis: Analysis, line: number, column: number): Range | undefined {
  const hit = symbolAtCursor(analysis, line, column);
  return hit ? occurrenceRange(hit.symbol.declaration) : undefined;
}

/** Every use of the symbol under the cursor (its display label is not a use). */
export function references(analysis: Analysis, line: number, column: number, includeDeclaration = true): Range[] {
  const hit = symbolAtCursor(analysis, line, column);
  if (!hit) return [];
  return hit.symbol.occurrences
    .filter((o) => o.role === "reference" || (includeDeclaration && o.role === "declaration"))
    .sort((a, b) => a.line - b.line || a.startColumn - b.startColumn)
    .map(occurrenceRange);
}

export interface Highlight {
  range: Range;
  kind: "write" | "read";
}

export function highlights(analysis: Analysis, line: number, column: number): Highlight[] {
  const hit = symbolAtCursor(analysis, line, column);
  if (!hit) return [];
  return hit.symbol.occurrences
    .filter((o) => o.role !== "label")
    .map((o) => ({ range: occurrenceRange(o), kind: o.role === "declaration" ? ("write" as const) : ("read" as const) }));
}

/* ---- Rename ------------------------------------------------------------ */

export interface TextEdit {
  range: Range;
  newText: string;
}

export type RenameTarget = { ok: true; range: Range; placeholder: string } | { ok: false; reason: string };
export type RenameResult = { ok: true; edits: TextEdit[] } | { ok: false; reason: string };

const BARE_NAME = /^[\p{L}\p{N}_.@]+$/u;
const CLOSING: Record<string, string> = { '"': '"', "(": ")", "[": "]", ":": ":", "{": "}" };

/** Diagram types whose statements accept a quoted string wherever a plain name is accepted. */
const QUOTING_KINDS = new Set<DiagramKind>([
  "sequence", "class", "object", "er", "usecase", "component", "deployment", "archimate", "activity-legacy",
]);

/** What can be renamed at the cursor, or why nothing can. */
export function prepareRename(analysis: Analysis, line: number, column: number): RenameTarget {
  const info = analysis.lineInfo[line];
  if (info?.mode === "comment") return { ok: false, reason: "Comments are not renamed." };
  const occurrence = occurrenceAt(analysis, line, column);
  if (!occurrence) {
    return { ok: false, reason: "Only declared names can be renamed: place the cursor on a participant, class, state, alias, or preprocessor name." };
  }
  const symbol = analysis.symbols[occurrence.symbol];
  if (!renameable(symbol)) return { ok: false, reason: "This is free text, not a name other statements refer to." };
  return {
    ok: true,
    range: occurrenceRange(occurrence),
    placeholder: analysis.lines[line].slice(occurrence.startColumn, occurrence.endColumn),
  };
}

function validateDelimited(newName: string, delimiter: string): string | undefined {
  const closer = CLOSING[delimiter];
  if (closer && newName.includes(closer)) return `The new name cannot contain ${closer === '"' ? "a double quote" : `"${closer}"`}.`;
  if (delimiter === "[" && newName.includes("[")) return 'The new name cannot contain "[".';
  return undefined;
}

/** The edits that rename the symbol under the cursor to `newName`. */
export function rename(analysis: Analysis, line: number, column: number, newName: string): RenameResult {
  const target = prepareRename(analysis, line, column);
  if (!target.ok) return target;
  const occurrence = occurrenceAt(analysis, line, column);
  if (!occurrence) return { ok: false, reason: "Nothing to rename here." };
  const symbol = analysis.symbols[occurrence.symbol];
  let name = newName.trim();
  if (!name) return { ok: false, reason: "The new name cannot be empty." };
  if (/[\r\n]/.test(name)) return { ok: false, reason: "The new name must be a single line." };

  if (occurrence.role === "label") {
    // The display text of an aliased element: only this one string changes.
    const problem = validateDelimited(name, occurrence.delimiter);
    if (problem) return { ok: false, reason: problem };
    if (occurrence.delimiter === "" && !BARE_NAME.test(name)) name = `"${name}"`;
    return { ok: true, edits: [{ range: occurrenceRange(occurrence), newText: name }] };
  }

  const preprocessor: SymbolCategory[] = ["variable", "function", "macro", "parameter", "sprite"];
  const isPreprocessor = preprocessor.includes(symbol.category);
  if (isPreprocessor) {
    const hadDollar = analysis.lines[symbol.declaration.line].slice(symbol.declaration.startColumn, symbol.declaration.endColumn).startsWith("$");
    if (hadDollar && !name.startsWith("$")) name = `$${name}`;
    if (!/^\$?[A-Za-z_]\w*$/.test(name)) return { ok: false, reason: "Preprocessor names may only contain letters, digits and underscores." };
  }
  if (symbol.category === "member" || symbol.category === "enumMember") {
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name)) return { ok: false, reason: "Member names may only contain letters, digits and underscores." };
  }

  const clash = referable(symbol)
    ? analysis.symbols.find((s) => s !== symbol && s.block === symbol.block && s.name === name && referable(s))
    : undefined;
  if (clash) return { ok: false, reason: `"${name}" already names a ${clash.keyword} in this diagram.` };

  const bare = BARE_NAME.test(name) || isPreprocessor;
  const swimlane = symbol.keyword === "swimlane";
  if (swimlane && name.includes("|")) return { ok: false, reason: 'A swimlane name cannot contain "|".' };
  const blockKind = analysis.blocks[symbol.block]?.kind;
  const quotable = blockKind !== undefined && QUOTING_KINDS.has(blockKind) && referable(symbol) && symbol.keyword !== "note";
  const edits: TextEdit[] = [];
  for (const occ of symbol.occurrences) {
    if (occ.role === "label") continue;
    if (occ.delimiter !== "") {
      const problem = validateDelimited(name, occ.delimiter);
      if (problem) return { ok: false, reason: problem };
      edits.push({ range: occurrenceRange(occ), newText: name });
    } else if (bare || swimlane) {
      edits.push({ range: occurrenceRange(occ), newText: name });
    } else if (quotable && !name.includes('"')) {
      edits.push({ range: occurrenceRange(occ), newText: `"${name}"` });
    } else {
      const hint = symbol.label === undefined ? ` Give it an alias instead, e.g. ${symbol.keyword} "${name}" as ${symbol.name}.` : " Rename its quoted label instead.";
      return { ok: false, reason: `A ${symbol.keyword} name used in other statements cannot contain spaces or punctuation.${hint}` };
    }
  }
  edits.sort((a, b) => a.range.startLine - b.range.startLine || a.range.startColumn - b.range.startColumn);
  return { ok: true, edits };
}

/* ---- Outline ----------------------------------------------------------- */

export type OutlineKind =
  | "block"
  | "class"
  | "interface"
  | "enum"
  | "element"
  | "container"
  | "member"
  | "method"
  | "enumMember"
  | "variable"
  | "function"
  | "structure"
  | "node";

export interface OutlineNode {
  name: string;
  detail: string;
  kind: OutlineKind;
  /** Whole extent, including any body. */
  range: Range;
  /** The name itself. */
  selectionRange: Range;
  children: OutlineNode[];
}

function outlineKind(symbol: PumlSymbol): OutlineKind {
  switch (symbol.category) {
    case "class":
      return "class";
    case "type":
      return symbol.keyword === "enum" ? "enum" : "interface";
    case "container":
      return "container";
    case "member":
      return symbol.keyword === "method" ? "method" : "member";
    case "enumMember":
      return "enumMember";
    case "variable":
    case "sprite":
    case "parameter":
      return "variable";
    case "function":
    case "macro":
      return "function";
    case "structure":
      return symbol.keyword === "node" ? "node" : "structure";
    case "element":
      return "element";
  }
}

function outlineNode(analysis: Analysis, symbol: PumlSymbol): OutlineNode {
  const selection = occurrenceRange(symbol.declaration);
  const endLine = Math.max(symbol.range.endLine, selection.endLine);
  const range: Range = {
    startLine: selection.startLine,
    startColumn: 0,
    endLine,
    endColumn: Math.max(analysis.lines[endLine]?.length ?? 0, endLine === selection.endLine ? selection.endColumn : 0),
  };
  const children = symbol.children
    .map((id) => analysis.symbols[id])
    .filter((child) => child.category !== "parameter")
    .sort((a, b) => a.declaration.line - b.declaration.line || a.declaration.startColumn - b.declaration.startColumn)
    .map((child) => outlineNode(analysis, child));
  const structural = symbol.category === "structure";
  const name = symbol.label !== undefined ? `${symbol.label} (${symbol.name})` : symbol.name;
  const detail = structural
    ? symbol.keyword === "node"
      ? ""
      : symbol.keyword
    : symbol.category === "function" || symbol.category === "macro"
      ? `${symbol.keyword} ${symbol.detail ?? ""}`.trim()
      : symbol.category === "member" || symbol.category === "enumMember"
        ? (symbol.detail ?? symbol.keyword)
        : symbol.keyword;
  return { name: name || symbol.keyword, detail, kind: outlineKind(symbol), range, selectionRange: selection, children };
}

/** The outline: one node per block, its declarations nested by container. */
export function documentSymbols(analysis: Analysis): OutlineNode[] {
  const perBlock = new Map<number, PumlSymbol[]>();
  for (const symbol of analysis.symbols) {
    if (symbol.parent !== undefined || symbol.category === "parameter") continue;
    // Preprocessor symbols are document-wide; show them in the block that declares them.
    const block = symbol.block >= 0 ? symbol.block : (analysis.lineInfo[symbol.declaration.line]?.block ?? -1);
    const list = perBlock.get(block);
    if (list) list.push(symbol);
    else perBlock.set(block, [symbol]);
  }
  const byPosition = (a: PumlSymbol, b: PumlSymbol) =>
    a.declaration.line - b.declaration.line || a.declaration.startColumn - b.declaration.startColumn;
  const nodes: OutlineNode[] = analysis.blocks.map((block, index) => {
    const startText = analysis.lines[block.startLine] ?? "";
    const tagStart = startText.indexOf("@");
    const title = analysis.blockTitles[index];
    return {
      name: title ?? startText.trim(),
      detail: kindLabel(block.kind),
      kind: "block" as const,
      range: { startLine: block.startLine, startColumn: 0, endLine: block.endLine, endColumn: analysis.lines[block.endLine]?.length ?? 0 },
      selectionRange: { startLine: block.startLine, startColumn: Math.max(0, tagStart), endLine: block.startLine, endColumn: startText.trimEnd().length },
      children: (perBlock.get(index) ?? []).sort(byPosition).map((symbol) => outlineNode(analysis, symbol)),
    };
  });
  return nodes;
}

/* ---- Semantic tokens --------------------------------------------------- */

export const SEMANTIC_TOKEN_TYPES = ["class", "type", "namespace", "variable", "function", "macro", "parameter", "property", "enumMember"] as const;
export const SEMANTIC_TOKEN_MODIFIERS = ["declaration"] as const;
export type SemanticTokenType = (typeof SEMANTIC_TOKEN_TYPES)[number];

export interface SemanticToken {
  line: number;
  startColumn: number;
  length: number;
  type: SemanticTokenType;
  declaration: boolean;
}

const TOKEN_TYPE: Record<SymbolCategory, SemanticTokenType | undefined> = {
  element: "variable",
  class: "class",
  type: "type",
  container: "namespace",
  member: "property",
  enumMember: "enumMember",
  variable: "variable",
  function: "function",
  macro: "macro",
  parameter: "parameter",
  sprite: "variable",
  structure: undefined,
};

/** Tokens for declared symbols and their references, sorted by position. */
export function semanticTokens(analysis: Analysis): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  for (const symbol of analysis.symbols) {
    const type = TOKEN_TYPE[symbol.category];
    if (!type) continue;
    for (const occ of symbol.occurrences) {
      if (occ.role === "label" || occ.endColumn <= occ.startColumn) continue;
      tokens.push({ line: occ.line, startColumn: occ.startColumn, length: occ.endColumn - occ.startColumn, type, declaration: occ.role === "declaration" });
    }
  }
  tokens.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn);
  // Semantic tokens may not overlap: keep the first of any colliding pair.
  const out: SemanticToken[] = [];
  for (const token of tokens) {
    const previous = out[out.length - 1];
    if (previous && previous.line === token.line && token.startColumn < previous.startColumn + previous.length) continue;
    out.push(token);
  }
  return out;
}
