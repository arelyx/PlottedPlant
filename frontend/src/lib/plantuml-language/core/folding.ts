/** Folding ranges, derived from the block-structure model. */
import { analyzeStructure, type DocumentStructure, type StructureBlock } from "./structure";

export interface FoldingRange {
  startLine: number;
  /** Last line hidden when folded (inclusive). */
  endLine: number;
  kind?: "comment" | "region";
}

/** `* node`, `** node`, `+ node`, `-- node`, also indented single markers; captures indent and markers. */
const TREE_NODE = /^([ \t]*)([*#+-]+)/;

function lastNonBlank(lines: readonly string[], from: number, to: number): number {
  let end = to;
  while (end > from && lines[end].trim() === "") end--;
  return end;
}

function indentWidth(whitespace: string): number {
  let width = 0;
  for (const char of whitespace) width += char === "\t" ? 4 : 1;
  return width;
}

/** Subtree ranges of a mindmap/WBS body: a node folds everything deeper that follows it. */
function treeRanges(
  lines: readonly string[],
  block: StructureBlock,
  covered: ReadonlySet<number>,
  out: FoldingRange[],
): void {
  const first = block.startLine + 1;
  const last = block.closedBy === "end" ? block.endLine - 1 : block.endLine;
  const nodes: { line: number; level: number }[] = [];
  let inMultiline = false;
  for (let i = first; i <= last; i++) {
    if (covered.has(i)) continue;
    const text = lines[i].trim();
    if (inMultiline) {
      if (/;\s*(?:<<.*>>)?$/.test(text)) inMultiline = false;
      continue;
    }
    const node = TREE_NODE.exec(lines[i]);
    if (!node) continue;
    nodes.push({ line: i, level: indentWidth(node[1]) + node[2].length });
    // `**:first line` … `last line;` is one node spread over several lines.
    if (/^[*#+-]+(?:\[[^\]]*\])?_?:/.test(text) && !/;\s*(?:<<.*>>)?$/.test(text)) inMultiline = true;
  }
  nodes.forEach((node, index) => {
    let next = index + 1;
    while (next < nodes.length && nodes[next].level > node.level) next++;
    if (next === index + 1) return;
    const boundary = next < nodes.length ? nodes[next].line - 1 : last;
    const end = lastNonBlank(lines, node.line, boundary);
    if (end > node.line) out.push({ startLine: node.line, endLine: end });
  });
}

/** `name {` … `}` pairs inside a `<style>` or `skinparam` body. */
function innerBraceRanges(lines: readonly string[], first: number, last: number, out: FoldingRange[]): void {
  const open: number[] = [];
  for (let i = first; i <= last; i++) {
    const text = lines[i].trim();
    if (text.endsWith("{")) open.push(i);
    else if (text.startsWith("}")) {
      const start = open.pop();
      if (start !== undefined && i - 1 > start) out.push({ startLine: start, endLine: i - 1 });
    }
  }
}

export function foldingRanges(
  lines: readonly string[],
  structure: DocumentStructure = analyzeStructure(lines),
): FoldingRange[] {
  const out: FoldingRange[] = [];

  for (const block of structure.blocks) {
    if (block.implicit) continue;
    const end = block.closedBy === "end" ? block.endLine - 1 : lastNonBlank(lines, block.startLine, block.endLine);
    if (end > block.startLine) out.push({ startLine: block.startLine, endLine: end, kind: "region" });
  }

  for (const construct of structure.constructs) {
    if (construct.closeLine < 0) continue;
    if (construct.kind === "comment") {
      if (construct.closeLine > construct.openLine) {
        out.push({ startLine: construct.openLine, endLine: construct.closeLine, kind: "comment" });
      }
      continue;
    }
    // A closing line that is part of the text (`last line;` of an activity label) folds away with it.
    const closerIsContent = structure.lines[construct.closeLine].role === "text";
    const marks = [construct.openLine, ...construct.midLines, construct.closeLine];
    for (let i = 0; i + 1 < marks.length; i++) {
      const isLast = i + 2 === marks.length;
      const end = isLast && closerIsContent ? marks[i + 1] : marks[i + 1] - 1;
      if (end > marks[i]) out.push({ startLine: marks[i], endLine: end });
    }
    if (construct.kind === "style" || construct.kind === "skinparam") {
      innerBraceRanges(lines, construct.openLine + 1, construct.closeLine - 1, out);
    }
  }

  // Runs of single-quote comment lines. The `'/` that ends a block comment is not one.
  const inBlockComment = new Set<number>();
  for (const construct of structure.constructs) {
    if (construct.kind !== "comment") continue;
    const end = construct.closeLine < 0 ? lines.length - 1 : construct.closeLine;
    for (let i = construct.openLine; i <= end; i++) inBlockComment.add(i);
  }
  let runStart = -1;
  for (let i = 0; i <= lines.length; i++) {
    const isComment =
      i < lines.length &&
      lines[i].trimStart().startsWith("'") &&
      structure.lines[i].role !== "text" &&
      !inBlockComment.has(i);
    if (isComment && runStart < 0) runStart = i;
    if (!isComment && runStart >= 0) {
      if (i - 1 > runStart) out.push({ startLine: runStart, endLine: i - 1, kind: "comment" });
      runStart = -1;
    }
  }

  structure.blocks.forEach((block, blockIndex) => {
    if (block.dialect !== "tree") return;
    const covered = new Set<number>();
    for (const construct of structure.constructs) {
      if (construct.block !== blockIndex || construct.closeLine < 0) continue;
      for (let i = construct.openLine; i <= construct.closeLine; i++) covered.add(i);
    }
    treeRanges(lines, block, covered, out);
  });

  return out.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}
