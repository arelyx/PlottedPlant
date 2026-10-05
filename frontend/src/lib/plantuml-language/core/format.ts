/**
 * Formatter: re-indent by nesting depth, trim trailing whitespace, collapse
 * long runs of blank lines. Nothing else is normalised.
 *
 * The one hard requirement is that formatting never changes what PlantUML
 * renders, so the formatter only ever touches whitespace the engine discards:
 * - `code` lines are trimmed by the engine before matching, so their leading
 *   and trailing whitespace is free;
 * - `text` lines (note, legend and title bodies, multi-line activity labels,
 *   bracketed descriptions) keep leading whitespace as content after the
 *   engine strips the columns common to the whole body, so a body only ever
 *   moves as a unit and its trailing whitespace and blank lines stay;
 * - `verbatim` lines (block comments, the lines after a trailing backslash,
 *   mindmap/WBS/Gantt/YAML/ditaa and other unparsed dialects) are not touched;
 * - a block that is unclosed or unbalanced is left exactly as it is.
 */
import type { Range } from "./types";
import { analyzeStructure, type DocumentStructure } from "./structure";

export interface FormatOptions {
  tabSize: number;
  insertSpaces: boolean;
}

export interface TextEdit {
  range: Range;
  text: string;
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

/** Blank-line runs of this length or longer shrink to a single blank line. */
const BLANK_RUN_LIMIT = 3;

function indentUnit(options: FormatOptions): string {
  return options.insertSpaces ? " ".repeat(Math.max(options.tabSize, 1)) : "\t";
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

function trailingWhitespaceStart(line: string): number {
  return line.length - /[ \t]*$/.exec(line)![0].length;
}

function commonPrefix(values: readonly string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0];
  for (const value of values) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

function inRange(line: number, range: LineRange | undefined): boolean {
  return !range || (line >= range.startLine && line <= range.endLine);
}

/**
 * Edits that format the document, or only the lines of `range`. Edits touch
 * whitespace only and never overlap; they are sorted by position.
 */
export function formatEdits(
  lines: readonly string[],
  options: FormatOptions,
  range?: LineRange,
  structure: DocumentStructure = analyzeStructure(lines),
): TextEdit[] {
  const unit = indentUnit(options);
  const edits: TextEdit[] = [];
  const formattable = (line: number) => {
    const block = structure.blocks[structure.lines[line].block];
    return block !== undefined && block.balanced && (block.closedBy === "end" || block.implicit);
  };

  // New leading whitespace per text line, decided group by group so a body moves as a unit.
  const groupIndent = new Map<number, { prefixLength: number; indent: string }>();
  structure.groups.forEach((group, index) => {
    const members = group.lines.filter((line) => lines[line].trim() !== "");
    if (members.length === 0 || !members.every((line) => formattable(line) && inRange(line, range))) return;
    // The engine strips common columns counting whitespace-only lines too, so what is left of
    // such a line depends on the indentation around it; a body that has one stays as it is.
    if (group.lines.some((line) => lines[line] !== "" && lines[line].trim() === "")) return;
    const prefix = commonPrefix(members.map((line) => leadingWhitespace(lines[line])));
    groupIndent.set(index, { prefixLength: prefix.length, indent: unit.repeat(group.depth) });
  });

  let blankRun: number[] = [];
  const flushBlankRun = () => {
    if (blankRun.length >= BLANK_RUN_LIMIT) {
      const first = blankRun[1];
      const last = blankRun[blankRun.length - 1];
      edits.push(
        last + 1 < lines.length
          ? { range: { startLine: first, startColumn: 0, endLine: last + 1, endColumn: 0 }, text: "" }
          : {
              range: { startLine: first - 1, startColumn: lines[first - 1].length, endLine: last, endColumn: lines[last].length },
              text: "",
            },
      );
    }
    blankRun = [];
  };

  lines.forEach((line, index) => {
    const info = structure.lines[index];
    const blankCode = (info.role === "code" || info.role === "tag") && line.trim() === "";
    if (!blankCode || !formattable(index) || !inRange(index, range)) flushBlankRun();
    if (!formattable(index) || !inRange(index, range)) return;

    if (info.role === "text") {
      const target = groupIndent.get(info.group);
      if (!target || line.trim() === "") return;
      if (line.slice(0, target.prefixLength) !== target.indent) {
        edits.push({
          range: { startLine: index, startColumn: 0, endLine: index, endColumn: target.prefixLength },
          text: target.indent,
        });
      }
      return;
    }
    if (info.role !== "code" && info.role !== "tag") return;

    if (blankCode) {
      blankRun.push(index);
      // Whitespace-only lines are emptied unless the run is about to be deleted anyway.
      if (line !== "") {
        edits.push({ range: { startLine: index, startColumn: 0, endLine: index, endColumn: line.length }, text: "" });
      }
      return;
    }

    const lead = leadingWhitespace(line);
    const indent = unit.repeat(info.depth);
    if (lead !== indent) {
      edits.push({ range: { startLine: index, startColumn: 0, endLine: index, endColumn: lead.length }, text: indent });
    }
    const trailingStart = trailingWhitespaceStart(line);
    // Trimming after a backslash would turn it into a line continuation.
    const exposesBackslash = line[trailingStart - 1] === "\\" && line[trailingStart - 2] !== "\\";
    if (trailingStart < line.length && !exposesBackslash) {
      edits.push({
        range: { startLine: index, startColumn: trailingStart, endLine: index, endColumn: line.length },
        text: "",
      });
    }
  });
  flushBlankRun();

  return dropOverlaps(edits);
}

/** A deleted blank run swallows the per-line edits inside it. */
function dropOverlaps(edits: TextEdit[]): TextEdit[] {
  const before = (a: Range, b: Range) =>
    a.endLine < b.startLine || (a.endLine === b.startLine && a.endColumn <= b.startColumn);
  const deletions = edits.filter((edit) => edit.range.startLine !== edit.range.endLine);
  const kept = edits.filter(
    (edit) =>
      edit.range.startLine !== edit.range.endLine ||
      !deletions.some((deletion) => !before(edit.range, deletion.range) && !before(deletion.range, edit.range)),
  );
  return kept.sort((a, b) => a.range.startLine - b.range.startLine || a.range.startColumn - b.range.startColumn);
}

/** Apply non-overlapping edits (as produced by this module) to a document. */
export function applyEdits(lines: readonly string[], edits: readonly TextEdit[]): string[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  let text = lines.join("\n");
  const at = (line: number, column: number) => offsets[line] + column;
  for (const edit of [...edits].sort(
    (a, b) => b.range.startLine - a.range.startLine || b.range.startColumn - a.range.startColumn,
  )) {
    text =
      text.slice(0, at(edit.range.startLine, edit.range.startColumn)) +
      edit.text +
      text.slice(at(edit.range.endLine, edit.range.endColumn));
  }
  return text.split("\n");
}

/** Format a whole document given as text. Line endings are preserved. */
export function formatText(text: string, options: FormatOptions): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n/);
  return applyEdits(lines, formatEdits(lines, options)).join(eol);
}

/**
 * On-type formatting: when `line` closes or continues a construct (`end`,
 * `else`, `endif`, `}`, `end note`…), snap it to the indentation of the line
 * that opened the construct. Returns null when there is nothing to do.
 */
export function closerIndentEdit(
  lines: readonly string[],
  line: number,
  structure: DocumentStructure = analyzeStructure(lines),
): TextEdit | null {
  const info = structure.lines[line];
  if (!info || info.role !== "code") return null;
  const block = structure.blocks[info.block];
  if (!block || block.dialect === "tree" || block.dialect === "lines" || block.dialect === "opaque") return null;

  const construct = structure.constructs.find(
    (candidate) => candidate.closeLine === line || candidate.midLines.includes(line),
  );
  if (!construct || construct.openLine === line || structure.lines[construct.openLine].role !== "code") return null;
  // A closer that shares its line with other content (`} | {` in Salt) stays where it is.
  if (construct.closer.length === 1 && lines[line].trim()[0] !== construct.closer) return null;

  const target = leadingWhitespace(lines[construct.openLine]);
  const current = leadingWhitespace(lines[line]);
  if (current === target) return null;
  return { range: { startLine: line, startColumn: 0, endLine: line, endColumn: current.length }, text: target };
}
