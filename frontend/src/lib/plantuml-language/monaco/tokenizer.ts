import type * as Monaco from "monaco-editor";
import { dialectKeywords } from "../core/dialects";
import type { DiagramKind } from "../core/types";
import { vocab } from "../vocab";
import { FAMILY_STATE, familyStates } from "./tokenizer-families";
import { PATTERNS, T, alternation, include, type Rule } from "./tokenizer-tokens";
import { umlStates } from "./tokenizer-uml";

const WORD = /^[a-z_]+$/;
const singleWords = (words: readonly string[]) => words.filter((w) => WORD.test(w));

// Element types whose `{ ... }` body is a member list rather than nested diagram content.
const CLASS_TYPES = [
  ...["class", "interface", "enum", "annotation", "abstract", "struct", "exception", "protocol", "metaclass"],
  ...["stereotype", "dataclass", "record", "object", "entity"],
];
// `map` and `json` have their own body syntax; `nwdiag` opens an embedded block.
const SPECIAL_TYPES = ["map", "json", "nwdiag"];
const EXTRA_PLAIN_TYPES = ["package", "namespace", "partition", "usecase", "boundary", "port", "portin", "portout"];
const plainTypes = [...new Set([...vocab.types, ...EXTRA_PLAIN_TYPES])].filter(
  (t) => !SPECIAL_TYPES.includes(t) && !CLASS_TYPES.includes(t),
);

// Statements whose remaining words are keywords too (`hide empty members`, `scale max 800 width`).
const COMMANDS = [
  ...["hide", "show", "remove", "restore", "set", "scale", "page", "rotate", "skin", "allowmixing", "allow_mixing"],
  ...["autonumber", "autoactivate", "autonewpage", "box", "together", "highlight", "mode", "use", "listsprites"],
  ...["swimlane", "legend"],
];
const COMMAND_EXTRA_WORDS = [
  ...["max", "width", "height", "dpi", "unlinked", "on", "off", "stop", "resume", "inc", "none"],
  ...["namespaceSeparator", "separator"],
];

const UML_KINDS: DiagramKind[] = [
  ...(["sequence", "class", "object", "usecase", "activity", "activity-legacy", "state"] as const),
  ...(["component", "deployment", "er", "timing", "archimate"] as const),
];

const GANTT_FLOW = ["then", "and"];
const GANTT_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const GANTT_WORDS = [
  ...["project", "starts", "start", "ends", "end", "lasts", "requires", "happens", "occurs", "pauses", "is", "are"],
  ...["at", "on", "in", "of", "to", "the", "from", "after", "before", "with", "for", "as", "just", "it"],
  ...["day", "days", "week", "weeks", "month", "months", "year", "years", "hour", "hours", "working"],
  ...["today", "closed", "open", "opened", "colored", "coloured", "completed", "complete", "deleted", "displays"],
  ...["same", "row", "links", "works", "off", "between", "separator", "resource", "resources", "names", "labels"],
  ...["column", "first", "last", "aligned", "printscale", "projectscale", "ganttscale", "daily", "weekly"],
  ...["monthly", "quarterly", "yearly", "zoom", "language", "print", "footbox", "calendar", "date", "numbering"],
];

const capitalised = (words: readonly string[]) => words.map((w) => w[0].toUpperCase() + w.slice(1));
const withCapitalised = (words: readonly string[]) => [...new Set([...words, ...capitalised(words)])];

/**
 * Colour names are case-insensitive in PlantUML but Monarch word lists are
 * not, so list the spellings people actually type: as documented (LightBlue),
 * lower case and upper case.
 */
function colorNames(): string[] {
  const camel = vocab.colors.map((c) => (c === "Darkorange" ? "DarkOrange" : c));
  return [...new Set([...vocab.colors, ...camel, ...camel.map((c) => c.toLowerCase()), ...camel.map((c) => c.toUpperCase())])];
}

/** One rule per diagram family: tag, optional name/arguments, then into the family's state. */
function startRules(): Rule[] {
  const byState = new Map<string, string[]>();
  for (const [tag, state] of Object.entries(FAMILY_STATE)) {
    byState.set(state, [...(byState.get(state) ?? []), tag]);
  }
  const rules: Rule[] = [...byState].map(([state, tags]) => [
    new RegExp(`^([ \\t]*)([@]start(?:${alternation(tags)}))\\b([^\\n]*)`),
    ["", T.tag, { token: T.tagArgs, next: `@${state}` }],
  ]);
  return [
    ...rules,
    [/^([ \t]*)([@]startuml)\b([^\n]*)/, ["", T.tag, T.tagArgs]],
    [/^([ \t]*)([@]start\w*)([^\n]*)/, ["", T.tag, { token: T.tagArgs, next: "@genericBlock" }]],
    [/^([ \t]*)([@]end\w*)([^\n]*)/, ["", T.tag, T.tagArgs]],
  ];
}

/**
 * The PlantUML Monarch grammar.
 *
 * The root state is the UML dialect: text before any `@start` tag, and after
 * `@startuml`, is tokenized as UML. Other `@start<tag>` lines push the state
 * for that diagram family, and `@end<tag>` pops back to the root.
 */
export const plantumlMonarchLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".plantuml",
  includeLF: true,

  ...PATTERNS,
  classTypesRe: `abstract[ \\t]+class|${alternation(CLASS_TYPES)}`,
  plainTypesRe: alternation(plainTypes),
  commandsRe: alternation(COMMANDS),

  typeKeywords: [...new Set([...vocab.types, ...EXTRA_PLAIN_TYPES, ...CLASS_TYPES])],
  commandWords: [
    ...new Set([
      ...singleWords(vocab.keywords),
      ...UML_KINDS.flatMap((kind) => singleWords(dialectKeywords(kind))),
      ...COMMAND_EXTRA_WORDS,
    ]),
  ],
  declKeywords: [
    ...["as", "extends", "implements", "order", "is", "has", "in", "of"],
    // timing: `clock clk with period 50 pulse 15 offset 10`, `analog "V" between 0 and 5 as v`
    ...["with", "period", "pulse", "offset", "between", "and"],
  ],
  inlineKeywords: ["as", "is", "has"],
  colorNames: colorNames(),
  ganttFlow: withCapitalised(GANTT_FLOW),
  ganttDays: withCapitalised([...GANTT_DAYS, ...GANTT_DAYS.map((d) => `${d}s`)]),
  ganttKeywords: withCapitalised([...GANTT_WORDS, ...singleWords(dialectKeywords("gantt"))]),
  nwdiagKeywords: ["network", "group", "nwdiag"],

  tokenizer: {
    root: [...startRules(), include("umlLine"), include("umlInline")],
    ...umlStates,
    ...familyStates,
  },
};
