import fs from "fs";
import path from "path";
import { analyze, type Analysis } from "../core/analysis";
import type { TextEdit } from "../core/navigation";
import type { Occurrence, PumlSymbol } from "../core/symbols";

/** Marks the cursor in test sources (a character PlantUML never uses). */
export const CURSOR = "¦";

export function corpus(name: string): string {
  return fs.readFileSync(path.join(__dirname, "corpus", name), "utf8");
}

export function withCursor(source: string): { text: string; line: number; column: number; analysis: Analysis } {
  const index = source.indexOf(CURSOR);
  if (index < 0) throw new Error("no cursor marker in test source");
  const text = source.slice(0, index) + source.slice(index + 1);
  const before = source.slice(0, index).split("\n");
  return { text, line: before.length - 1, column: before[before.length - 1].length, analysis: analyze(text) };
}

/** The referable symbol called `name` (optionally in a given block). */
export function sym(analysis: Analysis, name: string, block?: number): PumlSymbol {
  const found = analysis.symbols.filter((s) => s.name === name && (block === undefined || s.block === block));
  if (found.length !== 1) throw new Error(`expected exactly one symbol "${name}", found ${found.length}`);
  return found[0];
}

export function occurrenceText(analysis: Analysis, occ: Occurrence): string {
  return analysis.lines[occ.line].slice(occ.startColumn, occ.endColumn);
}

/** 1-based line numbers of a symbol's occurrences with the given role. */
export function linesOf(symbol: PumlSymbol, role: Occurrence["role"] = "reference"): number[] {
  return symbol.occurrences.filter((o) => o.role === role).map((o) => o.line + 1);
}

export function names(analysis: Analysis, block?: number): string[] {
  return analysis.symbols.filter((s) => (block === undefined || s.block === block) && s.category !== "structure").map((s) => s.name);
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  const lines = text.split("\n");
  const sorted = [...edits].sort((a, b) => b.range.startLine - a.range.startLine || b.range.startColumn - a.range.startColumn);
  for (const edit of sorted) {
    const line = lines[edit.range.startLine];
    lines[edit.range.startLine] = line.slice(0, edit.range.startColumn) + edit.newText + line.slice(edit.range.endColumn);
  }
  return lines.join("\n");
}
