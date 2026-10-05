import { T, include, type Rule, type States } from "./tokenizer-tokens";

/**
 * States for the diagram families that have their own syntax between
 * `@start<tag>` and `@end<tag>`: mindmap/WBS, Gantt, Salt, nwdiag, JSON, YAML,
 * EBNF, regex, Chen ER, DOT, and the opaque/generic fallbacks.
 */

const ws: Rule = [/[ \t]+/, ""];
const eol: Rule = [/\n/, ""];
// Line-scoped states pop *before* the newline, so that when they are nested each
// level pops in turn and the multi-line state underneath consumes the "\n".
const popAtEol: Rule = [/(?=\n)/, "", "@pop"];
const recover: Rule = [/^[ \t]*[@](?:start|end)\w*/, { token: "@rematch", next: "@popall" }];

/** `@end...` closes the block; a second `@start...` means the block was left open. */
const blockEnd: Rule[] = [
  [/^([ \t]*)([@]end\w*)([^\n]*)/, ["", T.tag, { token: T.tagArgs, next: "@popall" }]],
  recover,
];

/** What every family shares with UML: comments, preprocessor, styling, titles. */
const preamble: Rule[] = [
  ...blockEnd,
  include("comments"),
  include("preprocLine"),
  include("styleLine"),
  include("skinparamLine"),
  include("titleLines"),
  [/^([ \t]*)(scale|hide|show)\b/, ["", { token: T.keyword, next: "@commandLine" }]],
];

export const familyStates: States = {
  // ── Mindmap and WBS ─────────────────────────────────────────────────────
  mindmap: [
    ...preamble,
    [
      /^([ \t]*)((?:left|right|top|bottom)[ \t]+side|(?:left to right|right to left|top to bottom|bottom to top)[ \t]+direction)\b/,
      ["", T.keyword],
    ],
    [/^([ \t]*)([*#+\-]+)/, ["", { token: T.marker, next: "@treeNode" }]],
    ws,
    eol,
    [/@quoted/, T.string],
    [/@ident/, T.identifier],
    [/-+>/, T.arrow],
    [/\([^)\n]*\)/, T.entity],
    [/./, ""],
  ],
  // After the level marker: `[#color]`, `_` (boxless), `<`/`>` (WBS side), `(alias)`, stereotype
  treeNode: [
    [/\[#\w+\]/, T.color],
    [/[_<>](?![<>])/, T.marker],
    [/\([\w.]+\)/, T.identifier],
    [/<<[^>\n]*>>/, T.stereotype],
    [/:/, { token: T.delimiter, switchTo: "@treeNodeLong" }],
    [/(?=\n)/, "", "@pop"],
    [/[ \t]*/, { token: "", switchTo: "@treeNodeText" }],
  ],
  treeNodeText: [
    popAtEol,
    [/[ \t]+<<[^>\n]*>>(?=[ \t]*\n)/, T.stereotype],
    [/(")([^"\n]*)(")([ \t]+)(as)([ \t]+)(\w+)/, [T.string, T.string, T.string, "", T.keyword, "", T.identifier]],
    include("creoleMarkup"),
    include("creolePlain"),
  ],
  treeNodeLong: [
    recover,
    [/;(?=[ \t]*(?:<<[^>\n]*>>[ \t]*)?\n)/, T.delimiter, "@pop"],
    eol,
    include("creoleMarkup"),
    include("creolePlain"),
  ],

  // ── Gantt: sentences about [tasks], dates and durations ─────────────────
  gantt: [
    ...preamble,
    include("noteLines"),
    [/^([ \t]*)(--+)([^\n]*?)(--+)([ \t]*)(?=\n)/, ["", T.separator, T.heading, T.separator, ""]],
    ws,
    eol,
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/\[[^\]\n]*\]/, T.entity],
    [/\{[^}\n]*\}/, T.entity],
    [/'s\b/, T.keyword],
    [/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/, T.date],
    [/D[+-]\d+/, T.date],
    [/\d+(?:\.\d+)?%?/, T.number],
    [/@quoted/, T.string],
    [/@color/, T.color],
    [/-+>/, T.arrow],
    [
      /[A-Za-z_]\w*/,
      {
        cases: {
          "@ganttFlow": T.control,
          "@ganttDays": T.constant,
          "@ganttKeywords": T.keyword,
          "@colorNames": T.color,
          "@default": T.identifier,
        },
      },
    ],
    [/./, ""],
  ],

  // ── Salt wireframes ─────────────────────────────────────────────────────
  salt: [...preamble, include("saltOpen"), ws, eol, [/./, ""]],
  // `salt` inside @startuml: the layout starts at the next `{`
  saltWait: [recover, ws, eol, include("saltOpenSwitch"), [/(?=[^\s])/, "", "@pop"]],
  saltOpen: [
    [/(\{)([+#!\-^*\/]|T[+\-#!]?(?![A-Za-z])|S[I\-]?(?![A-Za-z]))/, [T.curly, { token: T.operator, next: "@saltBlock" }]],
    [/\{/, T.curly, "@saltBlock"],
  ],
  saltOpenSwitch: [
    [
      /(\{)([+#!\-^*\/]|T[+\-#!]?(?![A-Za-z])|S[I\-]?(?![A-Za-z]))/,
      [T.curly, { token: T.operator, switchTo: "@saltBlock" }],
    ],
    [/\{/, { token: T.curly, switchTo: "@saltBlock" }],
  ],
  saltBlock: [
    recover,
    include("comments"),
    include("preprocLine"),
    [/\}/, T.curly, "@pop"],
    include("saltOpen"),
    [/(?:--+|\.\.+|==+|~~+)(?=[ \t]*(?:\||\n))/, T.separator],
    [/^([ \t]*)(\++)(?=[ \t])/, ["", T.marker]],
    [/\[[ \t]*X?[ \t]*\](?=[ \t])|\([ \t]*X?[ \t]*\)(?=[ \t])/, T.constant],
    [/\[[^\]\n]*\]/, T.entity],
    [/\^[^^\n]*\^/, T.entity],
    [/@quoted/, T.string],
    [/\|/, T.delimiter],
    [/[.*](?=[ \t]*(?:\||\n|\}))/, T.constant],
    eol,
    include("creoleMarkup"),
    [/[\w\u00C0-\uFFFF]+|[ \t]+/, T.text],
    [/[^\n]/, T.text],
  ],

  // ── nwdiag ──────────────────────────────────────────────────────────────
  nwdiagFamily: [
    ...preamble,
    [/^([ \t]*)(nwdiag|packetdiag|rackdiag)([ \t]*)(\{)/, ["", T.type, "", { token: T.curly, next: "@nwdiag" }]],
    ws,
    eol,
    [/./, ""],
  ],
  nwdiag: [
    recover,
    include("comments"),
    include("preprocLine"),
    [/^[ \t]*\/\/[^\n]*/, T.comment],
    ws,
    eol,
    [/\{/, T.curly, "@push"],
    [/\}/, T.curly, "@pop"],
    [/@quoted/, T.string],
    [/@color/, T.color],
    [/\d+\.\d+\.\d+\.\d+(?:\/\d+)?/, T.number],
    [/\d+(?:\.\d+)?/, T.number],
    [/--+/, T.arrow],
    [/[A-Za-z_][\w-]*(?=[ \t]*=)/, T.attrName],
    [/[A-Za-z_][\w-]*/, { cases: { "@nwdiagKeywords": T.type, "@default": T.identifier } }],
    [/[\[\]]/, T.square],
    [/[=,;]/, T.delimiter],
    [/./, ""],
  ],

  // ── JSON and YAML data ──────────────────────────────────────────────────
  // Hand-written rather than embedding Monaco's own grammars with `nextEmbedded`:
  // Monaco's JSON tokenizer only loads once a JSON model is opened (never for an
  // embedded block), and an embedded YAML grammar would read PlantUML's
  // `#highlight` lines as comments and know nothing of `<style>` or `!directives`.
  dataHighlight: [[/^([ \t]*)(#highlight)\b/, ["", { token: T.directive, next: "@dataHighlightPath" }]]],
  dataHighlightPath: [
    ws,
    popAtEol,
    [/@quoted/, T.string],
    [/\//, T.delimiter],
    [/<<[^>\n]*>>/, T.stereotype],
    [/./, ""],
  ],
  json: [...blockEnd, include("preprocLine"), include("styleLine"), include("dataHighlight"), include("jsonValue")],
  jsonValue: [
    ws,
    eol,
    [/"(?:[^"\\\n]|\\.)*"(?=[ \t]*:)/, T.key],
    [/"(?:[^"\\\n]|\\.)*"?/, T.string],
    [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, T.number],
    [/(?:true|false|null)\b/, T.constant],
    [/[{}]/, T.curly],
    [/[\[\]]/, T.square],
    [/[:,]/, T.delimiter],
    [/./, ""],
  ],
  yaml: [
    ...blockEnd,
    include("preprocLine"),
    include("styleLine"),
    include("dataHighlight"),
    [/^[ \t]*#[^\n]*/, T.comment],
    [/[ \t]+#[^\n]*/, T.comment],
    [/^(---|\.\.\.)([ \t]*)(?=\n)/, [T.separator, ""]],
    ws,
    eol,
    [/-(?=[ \t\n])/, T.operator],
    [/(?:"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|[^\s#:"'\-{}\[\],&*!|>][^:#\n]*?)(?=[ \t]*:(?:[ \t]|\n))/, T.key],
    [/:(?=[ \t\n])/, T.delimiter],
    [/"(?:[^"\\\n]|\\.)*"?|'[^'\n]*'?/, T.string],
    [/\d{4}-\d{2}-\d{2}(?=[ \t]*(?:\n|#|,|\]|\}))/, T.date],
    [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?=[ \t]*(?:\n|#|,|\]|\}))/, T.number],
    [/(?:true|false|null|yes|no|~)(?=[ \t]*(?:\n|#|,|\]|\}))/, T.constant],
    [/[|>][+-]?(?=[ \t]*\n)/, T.operator],
    [/[{}]/, T.curly],
    [/[\[\]]/, T.square],
    [/,/, T.delimiter],
    [/[^\s#,\[\]{}](?:[^#,\[\]{}\n]*[^\s#,\[\]{}])?/, T.string],
    [/./, ""],
  ],

  // ── EBNF ────────────────────────────────────────────────────────────────
  ebnf: [
    ...blockEnd,
    include("preprocLine"),
    include("styleLine"),
    include("titleLines"),
    [/\(\*/, T.comment, "@ebnfComment"],
    [/^([ \t]*)(@ident)(?=[ \t]*=)/, ["", T.typeName]],
    ws,
    eol,
    [/"[^"\n]*"?|'[^'\n]*'?/, T.string],
    [/\?[^?\n]*\?/, T.escape],
    [/\d+/, T.number],
    [/[A-Za-z_][\w-]*/, T.identifier],
    [/[=|,;.*+\-?]/, T.operator],
    [/[{}]/, T.curly],
    [/[\[\]]/, T.square],
    [/[()]/, T.paren],
    [/./, ""],
  ],
  ebnfComment: [recover, [/\*\)/, T.comment, "@pop"], [/[^*\n]+|\*/, T.comment], eol],

  // ── Regex railroad diagrams: the body is one regular expression per line ─
  regex: [
    ...blockEnd,
    include("preprocLine"),
    include("styleLine"),
    include("titleLines"),
    eol,
    [/\\(?:[pP]\{[^}\n]*\}|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/, T.regexpEscape],
    [/\[\^?(?:\\.|[^\]\\\n])*\]?/, T.regexpClass],
    [/\(\?(?:[:=!]|<[=!]|<\w+>)?|[()]/, T.regexpOperator],
    [/[*+?]\??|\{\d+(?:,\d*)?\}\??|[|^$.]/, T.regexpOperator],
    [/[^\\\[()*+?{|^$.\n]+|./, T.regexp],
  ],

  // ── Chen entity-relationship ────────────────────────────────────────────
  chen: [
    ...preamble,
    [/^([ \t]*)(entity|relationship)\b/, ["", { token: T.type, next: "@chenDecl" }]],
    [
      /^([ \t]*)((?:left to right|right to left|top to bottom|bottom to top)[ \t]+direction)\b/,
      ["", T.keyword],
    ],
    include("chenInline"),
  ],
  chenDecl: [
    ws,
    popAtEol,
    [/\{(?=[ \t]*\n)/, { token: T.curly, switchTo: "@chenBody" }],
    include("chenInline"),
  ],
  chenBody: [
    recover,
    include("comments"),
    [/\}/, T.curly, "@pop"],
    [/\{/, T.curly, "@push"],
    [/(:)([ \t]*)(@ident)/, [T.delimiter, "", T.typeName]],
    include("chenInline"),
  ],
  chenInline: [
    ws,
    eol,
    [/@quoted/, T.string],
    [/<<[^>\n]*>>/, T.stereotype],
    [/@color/, T.color],
    [/[-=](?:\([^)\n]*\)|[<>]|\w+)?[-=]|[-=]>|<[-=]/, T.arrow],
    [/as\b/, T.keyword],
    [/@ident/, T.identifier],
    [/[{}]/, T.curly],
    [/[:,]/, T.delimiter],
    [/./, ""],
  ],

  // ── Graphviz DOT ────────────────────────────────────────────────────────
  dot: [
    ...blockEnd,
    [/^[ \t]*(?:\/\/|#)[^\n]*/, T.comment],
    [/\/\*/, T.comment, "@dotComment"],
    ws,
    eol,
    [/"(?:[^"\\\n]|\\.)*"?/, T.string],
    [/--|->/, T.arrow],
    [/-?\d+(?:\.\d+)?/, T.number],
    [/[A-Za-z_]\w*(?=[ \t]*=)/, T.attrName],
    [/[A-Za-z_]\w*/, { cases: { "strict|graph|digraph|subgraph|node|edge": T.type, "@default": T.identifier } }],
    [/[{}]/, T.curly],
    [/[\[\]]/, T.square],
    [/[=,;:]/, T.delimiter],
    [/./, ""],
  ],
  dotComment: [recover, [/\*\//, T.comment, "@pop"], [/[^*\n]+|\*/, T.comment], eol],

  // ── Bodies with no PlantUML structure ───────────────────────────────────
  // ditaa (ASCII art), jcckit: shown as-is
  opaque: [...blockEnd, eol, [/[^\n]+/, T.raw]],
  // @startmath / @startlatex: a formula
  formula: [
    ...blockEnd,
    eol,
    [/\\[A-Za-z]+|\\./, T.keyword],
    [/[{}]/, T.curly],
    [/\d+(?:\.\d+)?/, T.number],
    [/[\^_&=+\-*\/<>]/, T.operator],
    [/[^\\{}\d\^_&=+\-*\/<>\n]+/, T.raw],
  ],
  // @startcreole: a page of creole
  creoleBlock: [...blockEnd, include("comments"), include("proseBody")],
  // Any other tag (board, files, wire, git, chronology, ...): safe lexical colouring only
  genericBlock: [
    ...preamble,
    ws,
    eol,
    [/@quoted/, T.string],
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/@color/, T.color],
    [/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/, T.date],
    [/\d+(?:\.\d+)?%?/, T.number],
    [/@ident/, T.identifier],
    [/[{}]/, T.curly],
    [/[\[\]]/, T.square],
    [/[()]/, T.paren],
    [/./, ""],
  ],
};

/** `@start<tag>` → the state that tokenizes its body. `uml` stays in the root state. */
export const FAMILY_STATE: Record<string, string> = {
  mindmap: "mindmap",
  wbs: "mindmap",
  gantt: "gantt",
  salt: "salt",
  nwdiag: "nwdiagFamily",
  json: "json",
  yaml: "yaml",
  ebnf: "ebnf",
  regex: "regex",
  chen: "chen",
  dot: "dot",
  ditaa: "opaque",
  jcckit: "opaque",
  math: "formula",
  latex: "formula",
  creole: "creoleBlock",
};
