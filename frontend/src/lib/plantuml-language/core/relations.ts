/**
 * Shared parsing of names and arrows: `LEFT arrow RIGHT : label` lines and the
 * `"Label" as Alias` forms used by nearly every diagram type.
 */

export type Delimiter = "" | '"' | "(" | ":" | "[" | "{";

/** A name as written in the source. `start`/`end` cover the name without its delimiters. */
export interface Operand {
  text: string;
  start: number;
  end: number;
  delimiter: Delimiter;
  /** Start/end pseudo-nodes: `[*]`, `[H]`, `(*)`. */
  pseudo?: boolean;
  /** Column just past the closing delimiter (and any `::member` suffix). */
  outerEnd: number;
}

export interface Relation {
  left: Operand[];
  right: Operand[];
  arrow: { text: string; start: number; end: number };
  /** Column where trailing content (activation suffix, label, stereotype) starts. */
  rest: number;
  /** Column of the `:` introducing the label, or -1. */
  labelColon: number;
  /** Sequence-style open ends: `[-> A`, `A ->]`, `?-> A`. */
  openLeft: boolean;
  openRight: boolean;
}

const BARE = /[\p{L}\p{N}_@$]+(?:\.[\p{L}\p{N}_@$]+)*/uy;
const MEMBER_SUFFIX = /::[\p{L}\p{N}_]+/uy;
const HEAD = "[<>|{}*#+^\\\\/]";
const BODY = "[-.=~]";
const STYLE = "\\[(?:#|hidden|dashed|dotted|bold|plain|norank|thickness|single)[^\\]]*\\]";
const ARROW = new RegExp(
  `(?:${HEAD}|[ox](?=${HEAD}|${BODY}))*` +
    `${BODY}+(?:${STYLE})?${BODY}*(?:(?:left|right|up|down|le|ri|do|l|r|u|d)(?=${BODY}|${STYLE}))?(?:${STYLE})?${BODY}*` +
    `(?:${HEAD}|[ox](?=[\\s"]|$|${HEAD}))*`,
  "y",
);

const isSpace = (ch: string | undefined) => ch === " " || ch === "\t";

export function skipSpaces(text: string, i: number): number {
  while (i < text.length && isSpace(text[i])) i++;
  return i;
}

/** Read one name at column `i` (no leading whitespace). */
export function readOperand(text: string, i: number): Operand | undefined {
  const ch = text[i];
  if (ch === undefined) return undefined;
  if (ch === '"') {
    const close = text.indexOf('"', i + 1);
    if (close < 0) return undefined;
    return { text: text.slice(i + 1, close), start: i + 1, end: close, delimiter: '"', outerEnd: close + 1 };
  }
  if (ch === "[") {
    const close = text.indexOf("]", i + 1);
    if (close <= i + 1) return undefined;
    const inner = text.slice(i + 1, close);
    if (inner.includes("[")) return undefined;
    const pseudo = inner === "*" || /^H\*?$/.test(inner);
    return { text: inner, start: i + 1, end: close, delimiter: "[", pseudo, outerEnd: close + 1 };
  }
  if (ch === "(") {
    // `() Name` is the lollipop-interface shorthand.
    if (text[i + 1] === ")") {
      const inner = readOperand(text, skipSpaces(text, i + 2));
      return inner;
    }
    const close = text.indexOf(")", i + 1);
    if (close <= i + 1) return undefined;
    const inner = text.slice(i + 1, close);
    const pseudo = inner.startsWith("*");
    return { text: inner, start: i + 1, end: close, delimiter: "(", pseudo, outerEnd: close + 1 };
  }
  if (ch === ":") {
    const close = text.indexOf(":", i + 1);
    if (close <= i + 1 || isSpace(text[i + 1])) return undefined;
    return { text: text.slice(i + 1, close), start: i + 1, end: close, delimiter: ":", outerEnd: close + 1 };
  }
  BARE.lastIndex = i;
  const m = BARE.exec(text);
  if (!m) return undefined;
  let outerEnd = i + m[0].length;
  MEMBER_SUFFIX.lastIndex = outerEnd;
  const member = MEMBER_SUFFIX.exec(text);
  if (member) outerEnd += member[0].length;
  return { text: m[0], start: i, end: i + m[0].length, delimiter: "", outerEnd };
}

/** `(A, B)` association pairs carry two names in one pair of parentheses. */
function splitPair(text: string, op: Operand): Operand[] {
  if (op.delimiter !== "(" || !op.text.includes(",")) return [op];
  const out: Operand[] = [];
  let offset = op.start;
  for (const part of op.text.split(",")) {
    const lead = part.length - part.trimStart().length;
    const name = part.trim();
    if (name) {
      const inner = readOperand(text, offset + lead);
      if (inner && inner.outerEnd <= op.end) out.push(inner);
    }
    offset += part.length + 1;
  }
  return out;
}

function readArrow(text: string, i: number): { text: string; start: number; end: number } | undefined {
  ARROW.lastIndex = i;
  const m = ARROW.exec(text);
  if (!m || !m[0]) return undefined;
  return { text: m[0], start: i, end: i + m[0].length };
}

/** Parse `LEFT arrow RIGHT ...`. Returns undefined when the line is not a relation. */
export function parseRelation(text: string, from = 0): Relation | undefined {
  let i = skipSpaces(text, from);
  let left: Operand[] = [];
  let openLeft = false;

  let arrow = readArrow(text, i);
  if (arrow) openLeft = true;
  else if ((text[i] === "[" || text[i] === "?") && readArrow(text, i + 1)) {
    arrow = readArrow(text, i + 1);
    openLeft = true;
  } else {
    const op = readOperand(text, i);
    if (!op) return undefined;
    left = splitPair(text, op);
    i = skipSpaces(text, op.outerEnd);
    // `A "1" --> "many" B`: a quoted string between a name and the arrow is a cardinality.
    if (text[i] === '"') {
      const card = readOperand(text, i);
      if (card) i = skipSpaces(text, card.outerEnd);
    }
    arrow = readArrow(text, i);
    if (!arrow) return undefined;
  }
  if (!arrow) return undefined;

  i = skipSpaces(text, arrow.end);
  let right: Operand[] = [];
  let openRight = false;
  let rest = i;
  if (text[i] === "]" || text[i] === "?") {
    openRight = true;
    rest = i + 1;
  } else {
    let op = readOperand(text, i);
    if (op && op.delimiter === '"') {
      // A quoted string followed by another name is a cardinality, not the target.
      const after = skipSpaces(text, op.outerEnd);
      const next = after < text.length && text[after] !== ":" && text[after] !== "<" && text[after] !== "#"
        ? readOperand(text, after)
        : undefined;
      if (next) op = next;
    }
    if (!op) {
      // `A ->` while typing: still a relation, with nothing on the right yet.
      return { left, right, arrow, rest: i, labelColon: -1, openLeft, openRight };
    }
    right = splitPair(text, op);
    rest = op.outerEnd;
  }

  // Sequence multicast: `A -> B & C`.
  let j = skipSpaces(text, rest);
  while (text[j] === "&") {
    const more = readOperand(text, skipSpaces(text, j + 1));
    if (!more) break;
    right.push(more);
    rest = more.outerEnd;
    j = skipSpaces(text, rest);
  }

  let labelColon = -1;
  let quote = false;
  for (let k = rest; k < text.length; k++) {
    const ch = text[k];
    if (ch === '"') quote = !quote;
    else if (!quote && ch === ":" && text[k + 1] !== ":" && text[k - 1] !== ":") {
      labelColon = k;
      break;
    }
  }
  return { left, right, arrow, rest, labelColon, openLeft, openRight };
}

export interface NameForm {
  /** The name other statements refer to (alias if there is one). */
  code: Operand;
  /** The display text when an alias is present. */
  label?: Operand;
  /** Column after the whole form. */
  end: number;
}

/**
 * Parse `Name`, `"Name"`, `"Label" as Code`, `Code as "Label"`, `Label as Code`
 * and the bracketed shorthands at column `i`.
 */
export function parseNameForm(text: string, i: number): NameForm | undefined {
  i = skipSpaces(text, i);
  const first = readOperand(text, i);
  if (!first) return undefined;
  const afterFirst = skipSpaces(text, first.outerEnd);
  const as = /^as\s+/i.exec(text.slice(afterFirst));
  if (as && afterFirst > first.outerEnd) {
    const second = readOperand(text, afterFirst + as[0].length);
    if (second) {
      // The quoted side is the label; with two bare names the second is the code.
      if (second.delimiter === '"' && first.delimiter !== '"') return { code: first, label: second, end: second.outerEnd };
      return { code: second, label: first, end: second.outerEnd };
    }
  }
  return { code: first, end: first.outerEnd };
}

/** Which arrow shapes each relational dialect can parse; used for kind detection. */
export function arrowTraits(arrow: string): { sequence: boolean; state: boolean; crowfoot: boolean } {
  const hidden = /\[(?:hidden|norank)/.test(arrow);
  let core = arrow.replace(/\[[^\]]*\]/g, "");
  const direction = /([-.=~])(?:left|right|up|down|le|ri|do|l|r|u|d)(?=[-.=~])/.exec(core);
  if (direction) core = core.replace(direction[0], direction[1]);
  const parts = /^([^-.=~]*)([-.=~]+)([^-.=~]*)$/.exec(core);
  if (!parts) return { sequence: false, state: false, crowfoot: false };
  const [, leftHead, body, rightHead] = parts;
  const plain = /^-+$/.test(body);
  const heads = leftHead + rightHead;
  const sequence =
    plain &&
    !direction &&
    !hidden &&
    /^[ox]?(?:<<?|\\\\?|\/\/?)?$/.test(leftHead) &&
    /^(?:>>?|\\\\?|\/\/?)?[ox]?$/.test(rightHead) &&
    /[<>\\/]/.test(heads);
  const state = plain && ((leftHead === "" && rightHead === ">") || (leftHead === "<" && rightHead === ""));
  const crowfoot = /[{}]|\|\||\|o|o\|/.test(heads);
  return { sequence, state, crowfoot };
}
