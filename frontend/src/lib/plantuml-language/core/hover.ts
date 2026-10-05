import { type Analysis, occurrenceAt } from "./analysis";
import { colorHex, isColorName } from "./colors";
import { builtinFunction, builtinSignature } from "./facts";
import { labelColonIndex } from "./lines";
import { codeBlock, docMarkdown, renderDoc } from "./render";
import { lookupDocAt } from "./docs-locate";
import { stdlibMacro } from "./stdlib";
import type { PumlSymbol } from "./symbols";

export interface HoverResult {
  startColumn: number;
  endColumn: number;
  /** Markdown sections. */
  contents: string[];
  /** The markdown contains a colour swatch written as an HTML span. */
  html?: boolean;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Description of a symbol: its declaration line, kind, and how often it is used. */
export function describeSymbol(analysis: Analysis, symbol: PumlSymbol): string[] {
  const declarationLine = analysis.lines[symbol.declaration.line]?.trim() ?? "";
  const shown = declarationLine.length > 120 ? `${declarationLine.slice(0, 117)}...` : declarationLine;
  const references = symbol.occurrences.filter((o) => o.role === "reference").length;
  const where = symbol.implicit
    ? `declared by first use on line ${symbol.declaration.line + 1}`
    : `declared on line ${symbol.declaration.line + 1}`;
  const facts: string[] = [];
  if (symbol.category === "parameter") {
    const owner = symbol.parent !== undefined ? analysis.symbols[symbol.parent] : undefined;
    facts.push(`**parameter** of \`${owner?.detail ?? owner?.name ?? "?"}\`${symbol.detail ? ` (default ${symbol.detail.replace(/^=\s*/, "")})` : ""}`);
  } else if (symbol.category === "function" || symbol.category === "macro") {
    facts.push(`**${symbol.keyword}** \`${symbol.detail ?? symbol.name}\``);
  } else if (symbol.category === "variable") {
    facts.push(`**variable** \`${symbol.name}\`${symbol.detail ? ` = \`${symbol.detail}\`` : ""}`);
  } else if (symbol.category === "member" || symbol.category === "enumMember") {
    const owner = symbol.parent !== undefined ? analysis.symbols[symbol.parent] : undefined;
    facts.push(`**${symbol.keyword}** of ${owner ? `${owner.keyword} \`${owner.name}\`` : "its owner"}`);
  } else {
    facts.push(`**${symbol.keyword}** \`${symbol.name}\`${symbol.label !== undefined ? ` — "${symbol.label}"` : ""}`);
  }
  facts.push(`${where} · ${plural(references, "reference")}`);
  return [codeBlock(shown), facts.join("  \n")];
}

function swatch(hex: string): string {
  return `<span style="color:${hex};">■■■</span> \`${hex}\``;
}

function wordAt(text: string, column: number, pattern: RegExp): { text: string; start: number; end: number } | undefined {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index <= column && column <= m.index + m[0].length) return { text: m[0], start: m.index, end: m.index + m[0].length };
    if (m[0].length === 0) re.lastIndex++;
  }
  return undefined;
}

function insideQuotes(text: string, column: number): boolean {
  let open = false;
  for (let i = 0; i < column && i < text.length; i++) if (text[i] === '"') open = !open;
  return open;
}

/** Hover content for a position (0-based line and column), or undefined. */
export function hover(analysis: Analysis, line: number, column: number): HoverResult | undefined {
  const info = analysis.lineInfo[line];
  const text = analysis.lines[line];
  if (!info || text === undefined || info.mode === "comment" || info.mode === "outside") return undefined;
  const kind = analysis.blocks[info.block]?.kind;

  if (info.mode === "tag") {
    const tag = wordAt(text, column, /@(?:start|end)\w+/);
    const doc = tag && docMarkdown(tag.text.replace(/^@end/, "@start"), kind);
    return tag && doc ? { startColumn: tag.start, endColumn: tag.end, contents: [doc] } : undefined;
  }

  const occurrence = occurrenceAt(analysis, line, column);
  if (occurrence) {
    const symbol = analysis.symbols[occurrence.symbol];
    if (symbol.category !== "structure") {
      return { startColumn: occurrence.startColumn, endColumn: occurrence.endColumn, contents: describeSymbol(analysis, symbol) };
    }
  }

  const builtin = wordAt(text, column, /%[A-Za-z_]\w*/);
  if (builtin) {
    const fn = builtinFunction(builtin.text);
    if (fn) {
      const doc = docMarkdown(fn.name);
      return {
        startColumn: builtin.start,
        endColumn: builtin.end,
        contents: [codeBlock(builtinSignature(fn)), doc ?? fn.summary],
      };
    }
  }

  const hexColor = wordAt(text, column, /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/);
  if (hexColor && !isColorName(hexColor.text)) {
    const digits = hexColor.text.slice(1);
    const hex = digits.length === 3 ? `#${[...digits].map((d) => d + d).join("")}` : hexColor.text;
    return { startColumn: hexColor.start, endColumn: hexColor.end, contents: [swatch(hex.toLowerCase())], html: true };
  }

  const directive = wordAt(text, column, /!\w+/);
  if (directive && text.trimStart().startsWith("!") && directive.start === text.length - text.trimStart().length) {
    const doc = docMarkdown(directive.text.toLowerCase(), kind);
    if (doc) return { startColumn: directive.start, endColumn: directive.end, contents: [doc] };
  }

  const word = wordAt(text, column, /[\p{L}_][\p{L}\p{N}_-]*/u);
  if (!word) return keywordDoc(analysis, line, column, undefined);

  // Colours: `#Name`, `<color:Name>`, and values of *Color settings.
  const prefix = text.slice(0, word.start);
  const isColorPosition =
    prefix.endsWith("#") ||
    /<(?:color|back):#?$/i.test(prefix) ||
    /[/\\|-]$/.test(prefix) && /#\w+[/\\|-]$/.test(prefix) ||
    /\b\w*color\s+$/i.test(prefix) ||
    /\bcolou?red\s+in\s+(?:\w+\/)?$/i.test(prefix);
  if (isColorPosition) {
    const hex = colorHex(word.text);
    if (hex) {
      const start = prefix.endsWith("#") ? word.start - 1 : word.start;
      return { startColumn: start, endColumn: word.end, contents: [`${swatch(hex)} — colour \`${word.text}\``], html: true };
    }
  }

  if (info.mode === "text" || info.mode === "data" || info.mode === "members") return undefined;

  if (info.mode === "skinparam" || /^\s*skinparam\b/i.test(text)) {
    const name = (info.skinPrefix ?? []).join("") + word.text;
    const doc = docMarkdown(name, kind) ?? docMarkdown(word.text, kind);
    return doc ? { startColumn: word.start, endColumn: word.end, contents: [doc] } : undefined;
  }
  if (info.mode === "style") {
    const doc = docMarkdown(word.text, kind);
    return doc ? { startColumn: word.start, endColumn: word.end, contents: [doc] } : undefined;
  }

  const macro = stdlibMacro(word.text, analysis.includes);
  if (macro && text[word.end] === "(") {
    return {
      startColumn: word.start,
      endColumn: word.end,
      contents: [codeBlock(`${macro.name}(${macro.params.map((p) => p.name).join(", ")})`), `Macro from the \`${macro.library}\` standard library.`],
    };
  }

  return keywordDoc(analysis, line, column, word);
}

/**
 * Documentation for the keyword, phrase or symbol (arrow, `[*]`, ...) at a
 * position. Labels and quoted names are prose, so nothing there is a keyword.
 */
function keywordDoc(
  analysis: Analysis,
  line: number,
  column: number,
  word: { text: string; start: number; end: number } | undefined,
): HoverResult | undefined {
  const info = analysis.lineInfo[line];
  const text = analysis.lines[line];
  if (info.mode !== "code") return undefined;
  const kind = analysis.blocks[info.block]?.kind;
  const at = word?.start ?? column;

  if (insideQuotes(text, at)) return undefined;
  const colon = labelColonIndex(text);
  const activityText = (kind === "activity" && /^\s*(?:#\w+)?:/.test(text)) || ((kind === "mindmap" || kind === "wbs") && /^\s*(?:[*+-]+|#+)/.test(text));
  if (activityText || (colon >= 0 && at > colon && !/^\s*:/.test(text))) return undefined;

  const located = lookupDocAt(text, column, kind);
  if (located) return { startColumn: located.startColumn, endColumn: located.endColumn, contents: [renderDoc(located.entry)] };

  // The first word of a statement is a keyword even when kind detection is unsure which diagram this is.
  const indent = text.length - text.trimStart().length;
  if (word && word.start === indent) {
    const doc = docMarkdown(word.text.toLowerCase(), kind);
    if (doc) return { startColumn: word.start, endColumn: word.end, contents: [doc] };
  }
  return undefined;
}
