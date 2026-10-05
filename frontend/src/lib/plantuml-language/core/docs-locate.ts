import type { DiagramKind, DocEntry } from "./types";
import { allDocTerms, lookupDoc, lookupDocStrict } from "./docs";

export interface LocatedDoc {
  entry: DocEntry;
  /** The documented text under the cursor, as written in the line. */
  text: string;
  /** 0-based, end exclusive. */
  startColumn: number;
  endColumn: number;
}

interface Phrase {
  term: string;
  pattern: RegExp;
}

const WORD = /[!%@$]?[A-Za-z_][\w]*/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let phrases: Phrase[] | undefined;

/**
 * Terms that a plain word scan cannot find: phrases ("left to right
 * direction", "is colored in") and symbols ("==", "<|--", "[*]", "<<choice>>").
 */
function getPhrases(): Phrase[] {
  if (phrases) return phrases;
  phrases = allDocTerms()
    .filter((term) => !/^[!%@$]?[a-z_]\w*$/.test(term))
    .map((term) => {
      const body = term.split(" ").map(escapeRegExp).join("\\s+");
      // Word edges only where the term itself starts or ends with a word character.
      const left = /^\w/.test(term) ? "(?<![\\w])" : "";
      const right = /\w$/.test(term) ? "(?![\\w])" : "";
      return { term, pattern: new RegExp(left + body + right, "gi") };
    });
  return phrases;
}

/**
 * Documentation for whatever is written at a position in a line: the longest
 * documented phrase or symbol that covers the column, else the word there
 * (with its `!`, `%` or `@` sigil). With a known diagram kind the answer is
 * limited to meanings that apply to that kind.
 */
export function lookupDocAt(line: string, column: number, kind?: DiagramKind): LocatedDoc | undefined {
  const strict = kind !== undefined && kind !== "unknown" && kind !== "other";
  const find = (term: string) => (strict ? lookupDocStrict(term, kind) : lookupDoc(term, kind));
  const covers = (start: number, end: number) => column >= start && column < end;

  let best: LocatedDoc | undefined;
  const offer = (term: string, start: number, end: number) => {
    if (!covers(start, end) || (best && best.endColumn - best.startColumn >= end - start)) return;
    const entry = find(term);
    if (entry) best = { entry, text: line.slice(start, end), startColumn: start, endColumn: end };
  };

  for (const match of line.matchAll(WORD)) {
    const start = match.index;
    const text = match[0];
    offer(text, start, start + text.length);
    // "!$name" and "$name" are variables, not directives: fall back to the bare word only for the other sigils.
    if (/^[!%@]/.test(text)) offer(text.slice(1), start + 1, start + text.length);
  }
  for (const { term, pattern } of getPhrases()) {
    for (const match of line.matchAll(pattern)) offer(term, match.index, match.index + match[0].length);
  }
  return best;
}
