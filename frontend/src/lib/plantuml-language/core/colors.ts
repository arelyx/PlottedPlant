import type { DocumentStructure } from "./structure";

/**
 * PlantUML colour names and their RGB values.
 *
 * The 147 HTML/X11 names plus PlantUML's seven Archimate layer colours
 * (BUSINESS, APPLICATION, ...). Names are matched case-insensitively, as the
 * engine does. Keys are lower-case, values are six lower-case hex digits.
 */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4",
  azure: "f0ffff", beige: "f5f5dc", bisque: "ffe4c4", black: "000000", blanchedalmond: "ffebcd",
  blue: "0000ff", blueviolet: "8a2be2", brown: "a52a2a", burlywood: "deb887", cadetblue: "5f9ea0",
  chartreuse: "7fff00", chocolate: "d2691e", coral: "ff7f50", cornflowerblue: "6495ed",
  cornsilk: "fff8dc", crimson: "dc143c", cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b",
  darkgoldenrod: "b8860b", darkgray: "a9a9a9", darkgrey: "a9a9a9", darkgreen: "006400",
  darkkhaki: "bdb76b", darkmagenta: "8b008b", darkolivegreen: "556b2f", darkorange: "ff8c00",
  darkorchid: "9932cc", darkred: "8b0000", darksalmon: "e9967a", darkseagreen: "8fbc8f",
  darkslateblue: "483d8b", darkslategray: "2f4f4f", darkslategrey: "2f4f4f",
  darkturquoise: "00ced1", darkviolet: "9400d3", deeppink: "ff1493", deepskyblue: "00bfff",
  dimgray: "696969", dimgrey: "696969", dodgerblue: "1e90ff", firebrick: "b22222",
  floralwhite: "fffaf0", forestgreen: "228b22", fuchsia: "ff00ff", gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080", grey: "808080",
  green: "008000", greenyellow: "adff2f", honeydew: "f0fff0", hotpink: "ff69b4",
  indianred: "cd5c5c", indigo: "4b0082", ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa",
  lavenderblush: "fff0f5", lawngreen: "7cfc00", lemonchiffon: "fffacd", lightblue: "add8e6",
  lightcoral: "f08080", lightcyan: "e0ffff", lightgoldenrodyellow: "fafad2", lightgray: "d3d3d3",
  lightgrey: "d3d3d3", lightgreen: "90ee90", lightpink: "ffb6c1", lightsalmon: "ffa07a",
  lightseagreen: "20b2aa", lightskyblue: "87cefa", lightslategray: "778899",
  lightslategrey: "778899", lightsteelblue: "b0c4de", lightyellow: "ffffe0", lime: "00ff00",
  limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff", maroon: "800000",
  mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3", mediumpurple: "9370d8",
  mediumseagreen: "3cb371", mediumslateblue: "7b68ee", mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc", mediumvioletred: "c71585", midnightblue: "191970",
  mintcream: "f5fffa", mistyrose: "ffe4e1", moccasin: "ffe4b5", navajowhite: "ffdead",
  navy: "000080", oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23", orange: "ffa500",
  orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98",
  paleturquoise: "afeeee", palevioletred: "d87093", papayawhip: "ffefd5", peachpuff: "ffdab9",
  peru: "cd853f", pink: "ffc0cb", plum: "dda0dd", powderblue: "b0e0e6", purple: "800080",
  red: "ff0000", rosybrown: "bc8f8f", royalblue: "4169e1", saddlebrown: "8b4513", salmon: "fa8072",
  sandybrown: "f4a460", seagreen: "2e8b57", seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0",
  skyblue: "87ceeb", slateblue: "6a5acd", slategray: "708090", slategrey: "708090", snow: "fffafa",
  springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c", teal: "008080", thistle: "d8bfd8",
  tomato: "ff6347", turquoise: "40e0d0", violet: "ee82ee", wheat: "f5deb3", white: "ffffff",
  whitesmoke: "f5f5f5", yellow: "ffff00", yellowgreen: "9acd32", business: "ffffcc",
  application: "c2f0ff", motivation: "ccccff", strategy: "f8e7c0", technology: "c9ffc9",
  physical: "97ff97", implementation: "ffe0e0",
};

const TABLE = new Map(Object.entries(NAMED_COLORS));

/** Names the engine accepts as a colour without them having an RGB value. */
const SPECIAL_COLORS = new Set(["transparent", "background", "automatic"]);

function bareName(name: string): string {
  return (name.startsWith("#") ? name.slice(1) : name).toLowerCase();
}

/** `#rrggbb` for a PlantUML colour name (case-insensitive, leading `#` optional), or undefined. */
export function colorHex(name: string): string | undefined {
  const hex = TABLE.get(bareName(name));
  return hex === undefined ? undefined : `#${hex}`;
}

/** True for the 154 named colours (case-insensitive, leading `#` optional). */
export function isColorName(name: string): boolean {
  return TABLE.has(bareName(name));
}

/** True for `transparent`, `background` and `automatic`, which are colours without a swatch. */
export function isSpecialColorName(name: string): boolean {
  return SPECIAL_COLORS.has(bareName(name));
}

/** All colour names in lower case. */
export const colorNames: readonly string[] = [...TABLE.keys()];

/** One colour occurrence in a document. */
export interface ColorToken {
  line: number;
  /** Columns of the colour text, including its `#` when it has one (end exclusive). */
  start: number;
  end: number;
  text: string;
  /** `#rrggbb`, or null when the text is in a colour position but is not a colour PlantUML knows. */
  hex: string | null;
  /** Opacity from an eight-digit `#RRGGBBAA`, else 1. */
  alpha: number;
  /** The position takes a colour without `#` (after `line:`, after a gradient separator, after `##`). */
  bare: boolean;
}

/** Parse `RGB`, `RRGGBB` or `RRGGBBAA` hex digits (no `#`), as the engine does. */
function parseHex(digits: string): { hex: string; alpha: number } | undefined {
  if (!/^[0-9a-f]+$/i.test(digits)) return undefined;
  const lower = digits.toLowerCase();
  if (lower.length === 3) return { hex: `#${[...lower].map((d) => d + d).join("")}`, alpha: 1 };
  if (lower.length === 6) return { hex: `#${lower}`, alpha: 1 };
  if (lower.length === 8) return { hex: `#${lower.slice(0, 6)}`, alpha: parseInt(lower.slice(6), 16) / 255 };
  return undefined;
}

/**
 * Classify a single colour word (no `#`). Returns undefined when it is not a
 * colour and should not be reported either: special names, variables, numbers.
 */
function classify(word: string): { hex: string | null; alpha: number } | undefined {
  const hex = parseHex(word);
  if (hex) return hex;
  const named = colorHex(word);
  if (named) return { hex: named, alpha: 1 };
  if (isSpecialColorName(word) || !/^[A-Za-z]{3,}$/.test(word)) return undefined;
  return { hex: null, alpha: 1 };
}

const SPEC_KEY = /^(?:text|back|header|line\.dashed|line\.dotted|line\.bold|line|shadowing)/i;
const WORD = /^[A-Za-z0-9]+/;

class LineScanner {
  constructor(
    private readonly line: number,
    private readonly text: string,
    private readonly out: ColorToken[],
  ) {}

  /**
   * Record the colour word at `at`; unknown names only where `strict`. A
   * `bare` position holds the word without `#`; elsewhere a `#` may lead it.
   */
  word(at: number, strict: boolean, bare = false): number {
    const hash = !bare && this.text[at] === "#" ? 1 : 0;
    const word = WORD.exec(this.text.slice(at + hash))?.[0];
    if (!word) return at + hash;
    const end = at + hash + word.length;
    const kind = classify(word);
    if (kind && (kind.hex !== null || strict)) {
      this.out.push({ line: this.line, start: at, end, text: this.text.slice(at, end), ...kind, bare });
    }
    return end;
  }

  /**
   * A colour value that may be a gradient: `red`, `#fff`, `#red/blue`. In an
   * element spec the second colour is written without `#` (`bareRest`);
   * skinparam and style values also accept `#red/#blue`.
   */
  value(at: number, strict: boolean, bareRest: boolean, bareFirst = false): number {
    let end = this.word(at, strict, bareFirst);
    const second = bareRest ? /^[A-Za-z0-9]/ : /^#?[A-Za-z0-9]/;
    if (/[-\\|/]/.test(this.text[end] ?? "") && second.test(this.text.slice(end + 1))) {
      end = this.word(end + 1, strict, bareRest);
    }
    return end;
  }

  /**
   * A `#…` spec as used on elements and links: a plain colour or gradient,
   * `##[style]colour`, and `;`-separated `line:colour` / `back:colour` /
   * `text:colour` parts.
   */
  spec(at: number, strict: boolean): number {
    let i = at + 1;
    if (this.text[i] === "#") {
      i++;
      const style = /^\[\w+\]/.exec(this.text.slice(i));
      if (style) i += style[0].length;
      return this.value(i, strict, true, true);
    }
    if (!SPEC_KEY.test(this.text.slice(i))) {
      i = this.value(at, strict, true);
      if (this.text[i] !== ";") return i;
      i++;
    }
    for (;;) {
      const key = SPEC_KEY.exec(this.text.slice(i));
      if (!key) return i;
      i += key[0].length;
      if (this.text[i] === ":") i = this.value(i + 1, strict, true, true);
      if (this.text[i] !== ";") return i;
      i++;
    }
  }

  /** `<color:red>`, `<color #f00>`, `<back:yellow>`, `<font color="blue">` anywhere in text. */
  creole(): void {
    const tag = /<(?:color|back)[:\s]\s*(#?[A-Za-z0-9]+)(?=[>,])|<font\s+color="?(#?[A-Za-z0-9]+)/gi;
    for (let match = tag.exec(this.text); match; match = tag.exec(this.text)) {
      const value = match[1] ?? match[2];
      this.word(match.index + match[0].length - value.length, true);
    }
  }

  /** `"#RRGGBB"` as a whole quoted value: macro arguments and preprocessor variables. */
  quotedHex(): void {
    const quoted = /"(#(?:[0-9a-f]{8}|[0-9a-f]{6}))"/gi;
    for (let match = quoted.exec(this.text); match; match = quoted.exec(this.text)) this.word(match.index + 1, false);
  }

  /** `#…` specs in a statement, up to the `:` that starts its free-text label. */
  statement(): void {
    const text = this.text;
    const indent = text.length - text.trimStart().length;
    let inQuote = false;
    for (let i = indent; i < text.length; ) {
      const char = text[i];
      if (inQuote) {
        if (char === '"') inQuote = false;
        i++;
      } else if (char === '"') {
        inQuote = true;
        i++;
      } else if (char === "[" && text[i + 1] === "[") {
        const close = text.indexOf("]]", i);
        i = close < 0 ? text.length : close + 2;
      } else if (char === ":") {
        if (text[i + 1] !== ":") return;
        i += 2;
      } else if (char === "#" && (i === indent || /[\s[(,]/.test(text[i - 1]))) {
        // Measure the spec first: an unknown name is only certain to be meant as a colour
        // inside arrow brackets, closing the statement, or heading an activity label.
        const end = new LineScanner(this.line, text, []).spec(i, false);
        const rest = text.slice(end).trim();
        const strict = text[i - 1] === "[" || rest === "" || rest === "{" || (i === indent && text[end] === ":");
        this.spec(i, strict);
        i = Math.max(end, i + 1);
      } else {
        i++;
      }
    }
  }
}

/** Statements whose remainder is free text, where a `#` is just a character. */
const FREE_TEXT_STATEMENT =
  /^(?:title|header|footer|caption|legend|newpage|mainframe|center\s|(?:left|right)\s+(?:header|footer)|hide\s|show\s|remove\s|restore\s|autonumber|==|\.\.\.|'|@)/i;

export type ColorContext =
  /** An ordinary statement: element and link colour specs before the label. */
  | "statement"
  /** `Name value` inside a `skinparam { }` block, or a one-line `skinparam Name value`. */
  | "skinparam"
  /** A property line inside `<style>`. */
  | "style"
  /** Free text (note bodies, labels): creole colour tags only. */
  | "text"
  /** Mindmap and WBS nodes: `*[#colour] label`. */
  | "tree"
  /** Gantt statements: `is colored in Colour/Colour`. */
  | "gantt"
  /** nwdiag and Chen blocks: `color = "…"` attributes. */
  | "attributes";

/** Colours on one line, given what kind of line it is. */
export function findColors(text: string, line: number, context: ColorContext): ColorToken[] {
  const out: ColorToken[] = [];
  const scanner = new LineScanner(line, text, out);
  const trimmed = text.trim();
  if (trimmed.startsWith("'")) return out;
  scanner.creole();

  if (context === "skinparam" || context === "style") {
    // Only properties named …Color take a colour; the name may carry a stereotype.
    const entry = /^(\s*(?:skinparam(?:locked)?\s+)?[\w.]*(?:<<[^<>]*>>)?[\w.]*color(?:<<[^<>]*>>)?\s+)(\S+)/i.exec(text);
    if (entry && !/[$%]/.test(entry[2])) {
      // `#line.dashed:blue;text:coral` on an arrow skinparam is an element spec; anything else is a plain value.
      if (SPEC_KEY.test(entry[2].slice(1)) && entry[2].startsWith("#")) scanner.spec(entry[1].length, true);
      else scanner.value(entry[1].length, true, false);
    }
  } else if (context === "tree") {
    const node = /^\s*[*#+-]+\[(?=#)/.exec(text);
    if (node) scanner.spec(node[0].length, true);
  } else if (context === "gantt") {
    const colored = /\bcolou?red\s+in\s+/i.exec(text);
    if (colored) scanner.value(colored.index + colored[0].length, true, false);
  } else if (context === "attributes") {
    const attribute = /\bcolor\s*=\s*"/gi;
    for (let match = attribute.exec(text); match; match = attribute.exec(text)) {
      scanner.value(match.index + match[0].length, true, false);
    }
  } else if (context === "statement") {
    if (trimmed.startsWith("!")) scanner.quotedHex();
    else if (!FREE_TEXT_STATEMENT.test(trimmed)) {
      scanner.quotedHex();
      scanner.statement();
    }
  }
  return out.sort((a, b) => a.start - b.start).filter((token, i, all) => i === 0 || token.start >= all[i - 1].end);
}

/** Every colour in a document, using the structure model to tell colour positions from other `#` uses. */
export function documentColors(lines: readonly string[], structure: DocumentStructure): ColorToken[] {
  const inside = new Map<number, "skinparam" | "style">();
  for (const construct of structure.constructs) {
    if ((construct.kind !== "skinparam" && construct.kind !== "style") || construct.closeLine < 0) continue;
    for (let i = construct.openLine + 1; i < construct.closeLine; i++) inside.set(i, construct.kind);
  }

  const out: ColorToken[] = [];
  lines.forEach((text, line) => {
    const info = structure.lines[line];
    const block = structure.blocks[info.block];
    if (!block || !text.includes("#") && !/colou?r/i.test(text)) return;
    let context: ColorContext | null = null;
    if (inside.has(line)) context = inside.get(line)!;
    else if (block.dialect === "tree") context = "tree";
    else if (block.tag === "gantt") context = "gantt";
    else if (block.dialect === "braces") context = "attributes";
    else if (info.role === "text" || block.dialect === "salt") context = "text";
    else if (info.role === "code" && block.dialect === "uml") {
      context = /^\s*skinparam(?:locked)?\s/i.test(text) ? "skinparam" : "statement";
    }
    if (context) out.push(...findColors(text, line, context));
  });
  return out;
}
