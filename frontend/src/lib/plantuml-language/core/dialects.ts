import type { DiagramKind } from "./types";

/**
 * Per-diagram vocabulary that PlantUML's own word list (vocab.ts) does not
 * break down by diagram type, or omits entirely (Gantt, mindmap, Salt, ...).
 * Words are facts taken from the command regexes in PlantUML's source and
 * checked against the rendering server; every entry is a single word so a
 * tokenizer can match them with a word regex.
 */
const COMMON = [
  "title", "caption", "header", "footer", "legend", "endlegend", "note", "end", "left", "right", "top", "bottom",
  "center", "of", "on", "as", "hide", "show", "remove", "restore", "skinparam", "scale", "newpage", "mainframe",
  "sprite", "direction", "to",
];

const RELATION_WORDS = ["up", "down", "left", "right", "hidden", "norank", "dashed", "dotted", "bold", "plain", "thickness"];

const CLASS_WORDS = [
  ...COMMON, ...RELATION_WORDS,
  "extends", "implements", "abstract", "static", "namespace", "package", "together", "set", "separator",
  "namespaceseparator", "allowmixing", "allow_mixing", "empty", "members", "member", "fields", "field", "attributes",
  "attribute", "methods", "method", "circle", "circled", "circles", "stereotype", "stereotypes", "private",
  "protected", "public", "link", "over", "floating", "is", "layout_new_line", "unlinked", "true", "false", "null",
];

const DESCRIPTION_WORDS = [
  ...COMMON, ...RELATION_WORDS,
  "together", "port", "portin", "portout", "link", "over", "floating", "is", "stereotype", "unlinked",
];

const TREE_WORDS = [...COMMON, "side", "caption"];

const DIALECT_KEYWORDS: Partial<Record<DiagramKind, string[]>> = {
  sequence: [
    ...COMMON,
    "activate", "deactivate", "destroy", "create", "return", "autonumber", "stop", "resume", "inc", "autoactivate",
    "autonewpage", "alt", "else", "opt", "loop", "par", "par2", "break", "critical", "group", "partition", "also",
    "ref", "over", "across", "box", "order", "footbox", "unlinked", "ignore", "hnote", "rnote", "off", "is", "link",
  ],
  class: CLASS_WORDS,
  object: CLASS_WORDS,
  er: CLASS_WORDS,
  usecase: DESCRIPTION_WORDS,
  component: DESCRIPTION_WORDS,
  deployment: DESCRIPTION_WORDS,
  archimate: [...DESCRIPTION_WORDS, "archimate"],
  activity: [
    ...COMMON,
    "start", "stop", "kill", "detach", "if", "then", "else", "elseif", "endif", "is", "equals", "not", "switch",
    "case", "endswitch", "while", "endwhile", "repeat", "backward", "repeatwhile", "break", "fork", "again",
    "endfork", "merge", "endmerge", "split", "endsplit", "partition", "package", "rectangle", "card", "group",
    "swimlane", "goto", "label", "link", "floating", "when", "and", "or",
  ],
  "activity-legacy": [...COMMON, ...RELATION_WORDS, "if", "then", "else", "endif", "partition", "in", "is", "link"],
  state: [
    ...COMMON, ...RELATION_WORDS,
    "state", "description", "empty", "frame", "over", "link", "is",
  ],
  timing: [
    ...COMMON,
    "robust", "concise", "clock", "binary", "analog", "rectangle", "with", "period", "pulse", "offset", "has", "is",
    "between", "and", "highlight", "from", "use", "date", "format", "mode", "compact", "manual", "axis", "time",
    "ticks", "num", "multiple", "height", "pixels", "pixel", "every", "over", "link",
  ],
  gantt: [
    ...COMMON,
    "project", "gantt", "starts", "start", "ends", "end", "lasts", "requires", "happens", "occurs", "pauses", "is",
    "are", "then", "it", "at", "after", "before", "and", "with", "for", "the", "from", "in", "on", "to", "as", "just",
    "day", "days", "week", "weeks", "month", "hour", "hours", "minute", "second", "working", "today", "closed",
    "close", "open", "opened", "colored", "coloured", "completed", "complete", "completion", "deleted", "displayed",
    "displays", "same", "row", "named", "links", "link", "works", "off", "between", "separator", "task", "group",
    "resource", "resources", "names", "name", "labels", "label", "column", "first", "last", "aligned", "printscale",
    "projectscale", "ganttscale", "daily", "weekly", "monthly", "quarterly", "yearly", "zoom", "language", "print",
    "default", "footbox", "calendar", "numbering", "she", "he", "they", "bold", "dashed", "dotted",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  ],
  mindmap: TREE_WORDS,
  wbs: TREE_WORDS,
  salt: ["salt", "title", "header", "footer", "caption", "legend", "endlegend", "scale", "skinparam"],
  nwdiag: [
    "nwdiag", "network", "group", "inet", "address", "color", "description", "shape", "width", "label", "title",
    "caption", "header", "footer", "legend", "endlegend", "skinparam", "scale",
  ],
  json: ["highlight", "title", "caption", "header", "footer", "legend", "endlegend", "skinparam", "scale", "true", "false", "null"],
  yaml: ["highlight", "title", "caption", "header", "footer", "legend", "endlegend", "skinparam", "scale", "true", "false", "null"],
  chen: [
    "entity", "relationship", "as", "key", "derived", "multi", "title", "caption", "header", "footer", "legend",
    "endlegend", "left", "right", "top", "bottom", "to", "direction", "skinparam", "scale",
  ],
  ebnf: ["title", "caption", "header", "footer", "legend", "endlegend", "skinparam", "scale"],
  regex: ["title", "caption", "header", "footer", "legend", "endlegend", "skinparam", "scale"],
  chronology: [...COMMON, "happens", "is"],
};

/** Keywords specific to one diagram kind (empty if none are recorded). */
export function dialectKeywords(kind: DiagramKind): string[] {
  return DIALECT_KEYWORDS[kind] ?? [];
}

/**
 * Multi-word phrases that read as one unit in a dialect, for completion.
 * Each word of every phrase is also in `dialectKeywords(kind)` or the global
 * vocabulary.
 */
const DIALECT_PHRASES: Partial<Record<DiagramKind, string[]>> = {
  sequence: [
    "hide footbox", "hide unlinked", "autoactivate on", "autonumber stop", "autonumber resume", "note left of",
    "note right of", "note over", "note across", "ref over", "end note", "end box", "end ref",
  ],
  gantt: [
    "project starts", "saturday are closed", "sunday are closed", "today is", "is colored in", "printscale daily",
    "printscale weekly", "printscale monthly", "printscale quarterly", "printscale yearly", "hide footbox",
    "hide resources footbox", "hide resources names", "language", "then", "-- separator --",
  ],
  state: ["hide empty description"],
  class: ["hide empty members", "hide circle", "hide stereotype", "hide methods", "hide fields", "set namespaceSeparator", "set separator"],
  timing: ["hide time-axis", "mode compact", "scale 100 as 50 pixels", "use date format"],
};

export function dialectPhrases(kind: DiagramKind): string[] {
  return DIALECT_PHRASES[kind] ?? [];
}
