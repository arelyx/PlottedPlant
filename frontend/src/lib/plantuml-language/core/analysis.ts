import type { DiagramBlock } from "./types";
import { parseDocument } from "./blocks";
import type { LineInfo } from "./lines";
import { buildSymbolIndex, type Occurrence, type PumlSymbol, type SymbolIndex } from "./symbols";

/**
 * Everything the language features know about one version of a document.
 * Build it once per version with `analyze` and share it between providers.
 */
export interface Analysis extends SymbolIndex {
  lines: string[];
  blocks: DiagramBlock[];
  lineInfo: LineInfo[];
}

export function analyze(text: string): Analysis {
  const lines = text.split(/\r?\n/);
  const { blocks, lineInfo } = parseDocument(lines);
  return { lines, blocks, lineInfo, ...buildSymbolIndex(lines, blocks, lineInfo) };
}

/** The occurrence under the cursor, if any (the end column is inclusive so a cursor just after a name hits it). */
export function occurrenceAt(analysis: Analysis, line: number, column: number): Occurrence | undefined {
  const list = analysis.occurrencesByLine.get(line);
  if (!list) return undefined;
  let best: Occurrence | undefined;
  for (const occ of list) {
    if (column < occ.startColumn || column > occ.endColumn) continue;
    // Prefer the tightest match when ranges touch.
    if (!best || occ.endColumn - occ.startColumn < best.endColumn - best.startColumn) best = occ;
  }
  return best;
}

/** Symbols other statements can refer to in a block, plus document-wide preprocessor symbols. */
export function referableSymbols(analysis: Analysis, block: number): PumlSymbol[] {
  return analysis.symbols.filter(
    (s) => s.block === block && s.category !== "structure" && s.category !== "member" && s.category !== "enumMember",
  );
}

export function preprocessorSymbols(analysis: Analysis): PumlSymbol[] {
  return analysis.symbols.filter((s) => s.block === -1 && s.category !== "parameter");
}
