/**
 * Line classification: what each line of a document *is*, before any dialect
 * looks at it. Everything downstream (kind detection, symbols, completion,
 * hover, rename) reads this so that free text, comments and data bodies are
 * never mistaken for diagram statements.
 */

export type LineMode =
  /** Not inside any @start/@end block. */
  | "outside"
  /** The @start or @end line itself. */
  | "tag"
  | "comment"
  /** Free text: note/title/legend bodies, continuation lines of multi-line labels. */
  | "text"
  /** Inside <style> ... </style>. */
  | "style"
  /** Inside a `skinparam X { ... }` block. */
  | "skinparam"
  /** Inside the body of a class-like element. */
  | "members"
  /** Opaque data: JSON/YAML/Salt/ditaa/... bodies, sprite pixels. */
  | "data"
  /** A diagram statement or preprocessor directive. */
  | "code";

export interface LineInfo {
  mode: LineMode;
  /** Index into the block list, or -1 outside any block. */
  block: number;
  /** For "skinparam" lines: the enclosing prefixes, outermost first ("class", ...). */
  skinPrefix?: string[];
  /** For "style" lines: brace depth at the start of the line. */
  styleDepth?: number;
}

export interface RawBlock {
  tag: string;
  startLine: number;
  endLine: number;
  closed: boolean;
}

/** Block tags whose whole body is opaque to the symbol index. */
const DATA_TAGS = new Set([
  "json", "yaml", "ditaa", "dot", "math", "latex", "ebnf", "regex", "salt", "creole", "jcckit", "flow", "git", "hcl",
  "files", "tree", "wire", "board", "bpm", "def", "cute",
]);

const CLASS_BODY_KEYWORDS =
  "abstract\\s+class|abstract|static\\s+class|class|interface|enum|annotation|struct|entity|exception|metaclass|protocol|object|map|dataclass|record|relationship";

const CLASS_BODY_START = new RegExp(`^(?:${CLASS_BODY_KEYWORDS})\\b.*\\{\\s*$`, "i");
const JSON_BODY_START = /^json\b.*[{[]\s*$/i;
const SPRITE_START = /^sprite\s+\S+.*\{\s*$/i;
const SKINPARAM_BLOCK = /^skinparam\s+(\w+)?\s*\{\s*$/i;
const NOTE_START = /^(?:floating\s+)?[hr]?note\b/i;
const NOTE_INLINE_AS = /^(?:floating\s+)?[hr]?note\s+"[^"]*"\s+as\s+\S+/i;
const TEXT_BLOCK = /^(?:(?:left|right|center)\s+)?(title|header|footer|legend)\b(.*)$/i;
const LEGEND_ARGS = /^(?:\s+(?:left|right|top|bottom|center))*\s*$/i;
const REF_START = /^ref\s+over\b/i;
const ACTIVITY_TEXT_END = /[;|<>/\\\]}]$/;
const COLON_ACTOR = /^:[^:]+:\s*(?:$|as\b|<<|#|[-.<=~*o+^x])/;
const TREE_MULTILINE = /^(?:[*+-]+|#+)(?:\[#\w+\])?[_<>]?:/;
const BRACKET_BODY = /^[A-Za-z]\w*\s.*\[\s*$/;

/** True when the line carries a `: label` separator (a colon not part of `::`). */
export function hasLabelColon(text: string): boolean {
  return labelColonIndex(text) >= 0;
}

/** Index of the `:` that starts a trailing label, ignoring quotes, brackets and `::`. */
export function labelColonIndex(text: string, from = 0): number {
  let quote = false;
  let square = 0;
  let paren = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "[") square++;
    else if (ch === "]") square = Math.max(0, square - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === ":" && square === 0 && paren === 0) {
      if (text[i + 1] === ":") {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

function netBraces(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
  }
  return n;
}

function countQuotes(text: string): number {
  let n = 0;
  for (const ch of text) if (ch === '"') n++;
  return n;
}

/** Classify every line of the document. `blocks` must be sorted and non-overlapping. */
export function scanLines(lines: string[], blocks: RawBlock[]): LineInfo[] {
  const info: LineInfo[] = new Array(lines.length);
  let next = 0;
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    for (; next < block.startLine; next++) info[next] = { mode: "outside", block: -1 };
    scanBlock(lines, block, b, info);
    next = block.endLine + 1;
  }
  for (; next < lines.length; next++) info[next] = { mode: "outside", block: -1 };
  return info;
}

function scanBlock(lines: string[], block: RawBlock, index: number, info: LineInfo[]): void {
  info[block.startLine] = { mode: "tag", block: index };
  const last = block.closed ? block.endLine - 1 : block.endLine;
  if (block.closed) info[block.endLine] = { mode: "tag", block: index };

  const isTree = block.tag === "mindmap" || block.tag === "wbs";
  // Legacy activity diagrams allow an activity's quoted text to span lines.
  let legacyActivity = false;
  for (let i = block.startLine + 1; i <= last && !legacyActivity; i++) legacyActivity = lines[i].includes("(*)");
  let allData = DATA_TAGS.has(block.tag);
  let inComment = false;
  let textEnd: RegExp | null = null;
  /** Whether the line that matches `textEnd` is itself a statement (`end note`) rather than text. */
  let textEndIsCode = false;
  let inStyle = false;
  let styleDepth = 0;
  let dataDepth = 0;
  let memberDepth = 0;
  const skin: string[] = [];
  let inSkin = false;

  for (let i = block.startLine + 1; i <= last; i++) {
    const t = lines[i].trim();
    const set = (mode: LineMode, extra?: Partial<LineInfo>) => {
      info[i] = { mode, block: index, ...extra };
    };

    if (inComment) {
      set("comment");
      if (t.includes("'/")) inComment = false;
      continue;
    }
    if (t.startsWith("/'")) {
      set("comment");
      if (!t.includes("'/", 2)) inComment = true;
      continue;
    }
    if (textEnd) {
      if (textEnd.test(t)) {
        set(textEndIsCode ? "code" : "text");
        textEnd = null;
      } else set("text");
      continue;
    }
    if (inStyle) {
      if (/^<\/style>/i.test(t)) {
        inStyle = false;
        set("code");
      } else {
        set("style", { styleDepth });
        styleDepth = Math.max(0, styleDepth + netBraces(t));
      }
      continue;
    }
    if (/^<style>/i.test(t)) {
      set("code");
      if (!/<\/style>/i.test(t)) {
        inStyle = true;
        styleDepth = 0;
      }
      continue;
    }
    if (allData) {
      set(t.startsWith("'") ? "comment" : "data");
      continue;
    }
    if (dataDepth > 0) {
      set("data");
      dataDepth = Math.max(0, dataDepth + netBraces(t) + netSquare(t));
      continue;
    }
    if (inSkin) {
      if (t === "}") {
        skin.pop();
        if (skin.length === 0) inSkin = false;
        set(inSkin ? "skinparam" : "code", inSkin ? { skinPrefix: [...skin] } : undefined);
      } else {
        set("skinparam", { skinPrefix: [...skin] });
        const nested = /^(\w+)\s*\{\s*$/.exec(t);
        if (nested) skin.push(nested[1]);
      }
      continue;
    }
    if (memberDepth > 0) {
      memberDepth += netBraces(t);
      if (memberDepth <= 0) {
        memberDepth = 0;
        set("code");
      } else set(t.startsWith("'") ? "comment" : "members");
      continue;
    }

    if (t.startsWith("'")) {
      set("comment");
      continue;
    }
    set("code");
    if (!t || t.startsWith("!")) continue;

    if (/^salt\s*$/i.test(t)) {
      allData = true;
      continue;
    }
    const skinBlock = SKINPARAM_BLOCK.exec(t);
    if (skinBlock) {
      inSkin = true;
      skin.push(skinBlock[1] ?? "");
      continue;
    }
    if (NOTE_START.test(t)) {
      if (!NOTE_INLINE_AS.test(t) && !hasLabelColon(t)) {
        textEnd = /^end\s*[hr]?note\b/i;
        textEndIsCode = true;
      }
      continue;
    }
    const textBlock = TEXT_BLOCK.exec(t);
    if (textBlock) {
      const word = textBlock[1].toLowerCase();
      const rest = textBlock[2];
      const multi = word === "legend" ? LEGEND_ARGS.test(rest) : rest.trim() === "";
      if (multi) {
        textEnd = new RegExp(`^end\\s*${word}\\b`, "i");
        textEndIsCode = true;
      }
      continue;
    }
    if (REF_START.test(t)) {
      if (!hasLabelColon(t)) {
        textEnd = /^end\s*ref\b/i;
        textEndIsCode = true;
      }
      continue;
    }
    if (isTree) {
      if (TREE_MULTILINE.test(t) && !t.endsWith(";")) {
        textEnd = /;$/;
        textEndIsCode = false;
      }
      continue;
    }
    if (/^(?:#\w+)?:/.test(t)) {
      if (!ACTIVITY_TEXT_END.test(t) && !COLON_ACTOR.test(t)) {
        textEnd = ACTIVITY_TEXT_END;
        textEndIsCode = false;
      }
      continue;
    }
    if (SPRITE_START.test(t) || JSON_BODY_START.test(t)) {
      dataDepth = Math.max(0, netBraces(t) + netSquare(t));
      continue;
    }
    if (CLASS_BODY_START.test(t)) {
      memberDepth = netBraces(t);
      continue;
    }
    if (BRACKET_BODY.test(t) && !hasLabelColon(t) && !/^(?:if|while|repeat|case|switch|else|elseif)\b/i.test(t)) {
      textEnd = /^\]/;
      textEndIsCode = true;
      continue;
    }
    const openQuote = countQuotes(t) % 2 === 1;
    if (openQuote && (/^[A-Za-z/]+\s+.*\bas\s+"[^"]*$/.test(t) || (legacyActivity && /-+>\s*(?:\[[^\]]*\]\s*)?"[^"]*$/.test(t)))) {
      textEnd = /"/;
      textEndIsCode = false;
    }
  }
}

function netSquare(text: string): number {
  let n = 0;
  let quote = false;
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "[") n++;
    else if (ch === "]") n--;
  }
  return n;
}
