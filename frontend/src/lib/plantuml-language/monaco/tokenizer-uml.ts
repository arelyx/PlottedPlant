import { T, include, type Rule, type States } from "./tokenizer-tokens";

/**
 * States for everything that can appear inside `@startuml`: the shared
 * lexical structure of sequence, class, object, use case, activity, state,
 * component, deployment, ER, timing and archimate diagrams, plus the pieces
 * every diagram family reuses (comments, preprocessor, skinparam, `<style>`,
 * titles, notes, creole prose).
 *
 * PlantUML is line-oriented, so the grammar is too: `^` rules classify a line
 * by how it starts and push a line-scoped state that pops on "\n"; whatever is
 * not recognised falls through to the generic inline rules (names, arrows,
 * colours, strings) and is never marked invalid.
 */

/** Any state that survives past the end of a line must be able to bail out at a block boundary. */
const recover: Rule = [/^[ \t]*[@](?:start|end)\w*/, { token: "@rematch", next: "@popall" }];

const ws: Rule = [/[ \t]+/, ""];
// Line-scoped states pop *before* the newline, so that when they are nested each
// level pops in turn and the multi-line state underneath consumes the "\n".
const popAtEol: Rule = [/(?=\n)/, "", "@pop"];

export const umlStates: States = {
  // ── Pieces shared with the other diagram families ───────────────────────

  comments: [
    [/^[ \t]*'[^\n]*/, T.comment],
    [/\/'/, T.comment, "@blockComment"],
  ],
  blockComment: [
    recover,
    [/'\//, T.comment, "@pop"],
    [/[^'\n]+|'/, T.comment],
  ],

  preprocLine: [
    [/^([ \t]*)(!(?:include(?:_many|_once|url|sub|def)?|import)\b)/, ["", { token: T.directive, next: "@ppInclude" }]],
    [/^([ \t]*)(!theme\b)/, ["", { token: T.directive, next: "@ppTheme" }]],
    [
      /^([ \t]*)(!(?:(?:unquoted|final)[ \t]+)*(?:procedure|function)\b)/,
      ["", { token: T.directive, next: "@ppDefinition" }],
    ],
    [/^([ \t]*)(!define(?:long)?\b)/, ["", { token: T.directive, next: "@ppDefine" }]],
    [/^([ \t]*)(!log\b)/, ["", { token: T.directive, next: "@textLine" }]],
    [/^([ \t]*)(!\w+|!(?=\$))/, ["", { token: T.directive, next: "@preproc" }]],
  ],
  preprocExpr: [
    include("quoted"),
    [/%\w+(?=\()/, T.builtin],
    [/\$\w+(?=\()/, T.call],
    [/\$\w+/, T.variable],
    [/!\w+/, T.directive],
    [/@color/, T.color],
    [/\d+(?:\.\d+)?/, T.number],
    [/(?:true|false)\b/, T.constant],
    [/in\b/, T.keyword],
    [/@ident(?=\()/, T.call],
    [/@ident/, T.identifier],
    [/==|!=|<=|>=|&&|\|\||[-+*\/<>=!]/, T.operator],
    [/[()]/, T.paren],
    [/[\[\]]/, T.square],
    [/[{}]/, T.curly],
    [/[,;:]/, T.delimiter],
  ],
  preproc: [ws, popAtEol, [/\/'/, T.comment, "@blockComment"], include("preprocExpr"), [/./, ""]],
  ppInclude: [
    ws,
    popAtEol,
    [/<[^>\n]+>/, T.string],
    [/\$\w+/, T.variable],
    [/%\w+(?=\()/, T.builtin],
    [/@quoted/, T.string],
    [/[^\s<$%"!]+/, T.string],
    // `!include file.puml!part`
    [/!/, T.delimiter],
    [/./, ""],
  ],
  ppTheme: [
    ws,
    popAtEol,
    [/from\b/, T.keyword],
    [/\$\w+/, T.variable],
    [/@quoted/, T.string],
    [/[\w-]+(?=[ \t]*(?:\n|from\b))/, T.attrValue],
    [/[^\s]+/, T.string],
  ],
  ppDefinition: [
    ws,
    popAtEol,
    [/\$?\w+/, { token: T.call, switchTo: "@ppSignature" }],
    [/(?=[^\n])/, { token: "", switchTo: "@preproc" }],
  ],
  // `!define NAME(a, b) replacement text`: the replacement is diagram source
  ppDefine: [
    ws,
    popAtEol,
    [/\w+(?=\()/, { token: T.call, switchTo: "@ppDefineParams" }],
    [/\w+/, { token: T.call, switchTo: "@ppDefineBody" }],
    [/(?=[^\n])/, { token: "", switchTo: "@ppDefineBody" }],
  ],
  ppDefineParams: [
    ws,
    popAtEol,
    [/\(/, T.paren],
    [/\)/, { token: T.paren, switchTo: "@ppDefineBody" }],
    [/\$?\w+/, T.param],
    [/,/, T.delimiter],
    [/./, ""],
  ],
  ppDefineBody: [
    popAtEol,
    [/<\/?(?:b|i|u|s|color|size|font|back|sub|sup)\b[^>\n]*>/, T.markup],
    include("umlInline"),
  ],
  ppSignature: [
    [/\(/, { token: T.paren, switchTo: "@ppParams" }],
    [/(?=[\s\S])/, { token: "", switchTo: "@preproc" }],
  ],
  ppParams: [
    ws,
    popAtEol,
    [/\)/, { token: T.paren, switchTo: "@preproc" }],
    [/\$?\w+/, T.param],
    [/=/, { token: T.operator, next: "@ppDefault" }],
    [/,/, T.delimiter],
    [/./, ""],
  ],
  ppDefault: [
    ws,
    [/(?=[,)\n])/, "", "@pop"],
    include("quoted"),
    [/\$\w+/, T.variable],
    [/%\w+(?=\()/, T.builtin],
    [/\d+(?:\.\d+)?/, T.number],
    [/[^\s,)"$%]+/, T.string],
  ],

  // `skinparam Name value`, `skinparam Name { ... }`, `skinparam { ... }`
  skinparamLine: [[/^([ \t]*)(skinparam)\b/, ["", { token: T.keyword, next: "@skinparam" }]]],
  skinparam: [
    ws,
    popAtEol,
    [/<<[^>\n]*>>/, T.stereotype],
    [/\{/, { token: T.curly, switchTo: "@skinparamBlock" }],
    [/[A-Za-z_][\w.]*(?=[ \t]*(?:<<[^>\n]*>>)?[ \t]*\{)/, T.attrName],
    [/[A-Za-z_][\w.]*/, { token: T.attrName, switchTo: "@skinparamValue" }],
    [/(?=[^\n])/, { token: "", switchTo: "@skinparamValue" }],
  ],
  skinparamBlock: [
    recover,
    include("comments"),
    include("preprocLine"),
    ws,
    [/\n/, ""],
    [/\}/, T.curly, "@pop"],
    [/\{/, T.curly, "@push"],
    [/<<[^>\n]*>>/, T.stereotype],
    [/[A-Za-z_][\w.]*(?=[ \t]*(?:<<[^>\n]*>>)?[ \t]*\{)/, T.attrName],
    [/[A-Za-z_][\w.]*/, T.attrName, "@skinparamValue"],
    [/./, ""],
  ],
  skinparamValue: [
    ws,
    popAtEol,
    [/(?=\})/, "", "@pop"],
    [/<<[^>\n]*>>/, T.stereotype],
    [/@color/, T.color],
    include("quoted"),
    [/-?\d+(?:\.\d+)?/, T.number],
    [/(?:true|false)\b/, T.constant],
    [/\$\w+/, T.variable],
    [/%\w+(?=\()/, T.builtin],
    [/[A-Za-z_][\w-]*/, { cases: { "@colorNames": T.color, "@default": T.attrValue } }],
    [/./, T.attrValue],
  ],

  // `<style> ... </style>`: CSS-like, but properties are `Name value` lines.
  styleLine: [[/^([ \t]*)(<style>)/, ["", { token: T.keyword, next: "@style" }]]],
  style: [
    recover,
    [/<\/style>/, T.keyword, "@pop"],
    include("comments"),
    include("preprocLine"),
    ws,
    [/\n/, ""],
    [/[{}]/, T.curly],
    [/[^\s{}][^\n{}]*?(?=[ \t]*\{)/, T.selector],
    [/[A-Za-z_][\w-]*/, T.attrName, "@styleValue"],
    [/./, ""],
  ],
  styleValue: [
    ws,
    popAtEol,
    [/(?=\})/, "", "@pop"],
    [/;/, T.delimiter, "@pop"],
    [/:/, T.delimiter],
    [/@color/, T.color],
    include("quoted"),
    [/-?\d+(?:\.\d+)?/, T.number],
    [/(?:true|false)\b/, T.constant],
    [/\$\w+/, T.variable],
    [/[A-Za-z_][\w-]*/, { cases: { "@colorNames": T.color, "@default": T.attrValue } }],
    [/./, T.attrValue],
  ],

  // title / header / footer / caption / legend, single-line or as a block.
  titleLines: [
    [
      /^([ \t]*)((?:(?:left|right|center)[ \t]+)?)(title|header|footer|caption)([ \t]*)(?=\n)/,
      ["", T.keyword, T.keyword, { token: "", next: "@proseBlock.$3" }],
    ],
    [
      /^([ \t]*)(legend)((?:[ \t]+(?:left|right|top|bottom|center))*)([ \t]*)(?=\n)/,
      ["", T.keyword, T.keyword, { token: "", next: "@proseBlock.legend" }],
    ],
    [
      /^([ \t]*)((?:(?:left|right|center)[ \t]+)?(?:title|header|footer|caption|mainframe|newpage))\b/,
      ["", { token: T.keyword, next: "@textLine" }],
    ],
  ],
  proseBlock: [
    recover,
    [/^([ \t]*)(end[ \t]*$S2)\b/, ["", { token: T.keyword, next: "@pop" }]],
    include("proseBody"),
  ],

  // Notes: `note left of A: text` is one line; without the colon the body runs to `end note`.
  noteLines: [
    [
      /^([ \t]*)(\/?)([ \t]*)((?:floating[ \t]+)?(?:note|hnote|rnote))\b(?=[ \t]+"[^"\n]*"[ \t]+as\b)/,
      ["", T.operator, "", T.keyword],
    ],
    [
      /^([ \t]*)(\/?)([ \t]*)((?:floating[ \t]+)?(?:note|hnote|rnote))\b(?=(?:[^:\n"]|::|"[^"\n]*")*:(?!:))/,
      ["", T.operator, "", { token: T.keyword, next: "@noteHead" }],
    ],
    [
      /^([ \t]*)(\/?)([ \t]*)((?:floating[ \t]+)?(?:note|hnote|rnote))\b/,
      ["", T.operator, "", { token: T.keyword, next: "@noteHeadMulti.note" }],
    ],
    [/^([ \t]*)(ref)(?=[ \t]+over\b[^:\n]*:)/, ["", { token: T.keyword, next: "@noteHead" }]],
    [/^([ \t]*)(ref)(?=[ \t]+over\b)/, ["", { token: T.keyword, next: "@noteHeadMulti.ref" }]],
  ],
  noteHeadCommon: [
    ws,
    [/\/'/, T.comment, "@blockComment"],
    include("quoted"),
    [/@color/, T.color],
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/::/, T.delimiter],
    [/(?:left|right|top|bottom|of|over|on|link|across|as)\b/, T.keyword],
    [/\$\w+/, T.variable],
    [/@ident/, T.identifier],
    [/\([^)\n]*\)|\[[^\]\n]*\]/, T.entity],
    [/,/, T.delimiter],
  ],
  noteHead: [
    popAtEol,
    [/:/, { token: T.delimiter, switchTo: "@textLine" }],
    include("noteHeadCommon"),
    [/./, ""],
  ],
  noteHeadMulti: [
    [/\n/, { token: "", switchTo: "@$S2Body" }],
    include("noteHeadCommon"),
    [/./, ""],
  ],
  noteBody: [
    recover,
    [/^([ \t]*)(end[ \t]*[hr]?note)\b/, ["", { token: T.keyword, next: "@pop" }]],
    include("proseBody"),
  ],
  refBody: [
    recover,
    [/^([ \t]*)(end[ \t]*ref)\b/, ["", { token: T.keyword, next: "@pop" }]],
    include("proseBody"),
  ],

  // Quoted names and labels. Variables are substituted inside them, and "\n" breaks the line.
  quoted: [[/"/, T.string, "@quotedString"]],
  quotedString: [
    [/"/, T.string, "@pop"],
    popAtEol,
    [/\\[nrlt]/, T.escape],
    [/\$[A-Za-z_]\w*/, T.variable],
    [/%\w+(?=\()/, T.builtin],
    [/<&[\w-]+(?:\*\d+)?>|<:[\w+-]+:>|<\$[^>\n"]+>/, T.icon],
    [/[^"\\$%<\n]+|./, T.string],
  ],

  // ── Prose and creole markup ─────────────────────────────────────────────

  creoleMarkup: [
    [/\\[nrlt]|\\\\/, T.escape],
    [/<U\+[0-9a-fA-F]+>|&#\d+;|&[a-zA-Z]+;/, T.escape],
    [/%\w+(?=\()/, T.builtin],
    [/\$[A-Za-z_]\w*/, T.variable],
    [/[a-z][a-z0-9+.-]*:\/\/[^\s\]>"]*/, T.link],
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/<&[\w-]+(?:\*\d+)?>|<:[\w+-]+:>|<#\w+:[\w+-]+:>|<\$[^>\n]+>/, T.icon],
    [/<\/?(?:b|i|u|s|w|del|strike|plain|sub|sup|back|color|size|font|img|code|text|math|latex)\b[^>\n]*>/, T.markup],
    [/\*\*(?=[^\s*])(?:[^*\n]|\*(?!\*))*\*\*/, T.bold],
    [/\/\/(?=[^\s\/])(?:[^\/\n]|\/(?!\/))*\/\//, T.italic],
    [/""(?:[^"\n]|"(?!"))+""/, T.mono],
    [/--(?=[^\s-])(?:[^-\n]|-(?!-))*--/, T.strike],
    [/__(?=[^\s_])(?:[^_\n]|_(?!_))*__/, T.underline],
    [/~~(?=[^\s~])(?:[^~\n]|~(?!~))*~~/, T.underline],
  ],
  creolePlain: [
    [/[\w\u00C0-\uFFFF]+|[ \t]+/, T.text],
    [/[^\n]/, T.text],
  ],
  // Body of a multi-line prose block: creole with its line-level constructs.
  proseBody: [
    include("preprocLine"),
    [/^([ \t]*)(-{4,}|={4,}|\.{4,}|_{4,})([ \t]*)(?=\n)/, ["", T.separator, ""]],
    [/^([ \t]*)([*#]+)(?=[ \t])/, [T.text, T.marker]],
    [/^([ \t]*)(=+)(?=[ \t])([^\n]*)/, [T.text, T.marker, T.heading]],
    [/\|=?/, T.delimiter],
    [/\n/, ""],
    include("creoleMarkup"),
    include("creolePlain"),
  ],
  textLine: [popAtEol, include("creoleMarkup"), include("creolePlain")],

  // ── Line classification inside @startuml ────────────────────────────────

  umlLine: [
    include("comments"),
    include("preprocLine"),
    include("styleLine"),
    include("skinparamLine"),
    include("titleLines"),
    include("noteLines"),

    // Dividers and spacers
    [/^([ \t]*)(==+)([^\n]*?)(==+)([ \t]*)(?=\n)/, ["", T.separator, T.heading, T.separator, ""]],
    [/^([ \t]*)(\.{3})([^\n]*?)((?:\.{3})?)([ \t]*)(?=\n)/, ["", T.separator, T.text, T.separator, ""]],
    [/^([ \t]*)(\|\|)(\d+)(\|\|)([ \t]*)(?=\n)/, ["", T.separator, T.number, T.separator, ""]],
    [/^([ \t]*)(--+|\.\.+|__+|\|\|\|?)([ \t]*)(?=\n)/, ["", T.separator, ""]],

    // Activity swimlane `|Lane|`, `|#color|alias| Title`
    [/^([ \t]*)(\|)(?=[^|\n]+\|)/, ["", { token: T.delimiter, next: "@swimlane" }]],

    // `:Actor:` (use case) before `:label;` (activity), which may span lines
    [
      /^([ \t]*)(:[^:\n]+:)(?=[ \t]*(?:\n|as[ \t]|<<|#\w|[ox*+#^]?[-.~=]|<[-.|~=]|\/[ \t]))(?![^\n]*;[ \t]*\n)/,
      ["", T.entity],
    ],
    [/^([ \t]*)((?:#\w+)?)(:)/, ["", T.color, { token: T.delimiter, next: "@activityLabel" }]],
    // `-> label;` between activities
    [
      /^([ \t]*)(-+)(\[)(?=[^\]\n]*\][-.]*>[^\n]*;[ \t]*\n)/,
      ["", T.arrow, { token: T.arrow, next: "@arrowStyleLabel" }],
    ],
    [/^([ \t]*)(-+>)(?=[^\n]*;[ \t]*\n)/, ["", { token: T.arrow, next: "@activityLabel" }]],

    // Control flow
    [
      /^([ \t]*)(if|elseif|else[ \t]+if|while|switch|case|repeat[ \t]*while|end[ \t]*while)\b(?![ \t]*[-<.=~])/,
      ["", { token: T.control, next: "@conditionLine" }],
    ],
    [/^([ \t]*)(else)(?=[ \t]*\()/, ["", { token: T.control, next: "@conditionLine" }]],
    [/^([ \t]*)(backward|repeat)([ \t]*)(:)/, ["", T.control, "", { token: T.delimiter, next: "@activityLabel" }]],
    [
      /^([ \t]*)(alt|else|opt|loop|par2?|break|critical|group|also)\b(?![ \t]*(?:[-<.=~]|:[ \t]))/,
      ["", { token: T.control, next: "@groupLine" }],
    ],
    [/^([ \t]*)(return)\b(?![ \t]*[-<.=~])/, ["", { token: T.control, next: "@textLine" }]],
    [
      /^([ \t]*)((?:fork|split)[ \t]+again|start|stop|kill|detach|endif|endswitch|endfork|endmerge|endsplit|repeat|fork|split|backward|goto|merge)\b(?![ \t]*[-<.=~])/,
      ["", T.control],
    ],
    [/^([ \t]*)(end[ \t]*(?:fork|merge|split|group|if|switch|repeat)?)\b(?=[ \t]*(?:\n|\{|#|<<))/, ["", T.control]],
    [/^([ \t]*)(end[ \t]*(?:note|rnote|hnote|ref|legend|title|header|footer|caption|box))\b/, ["", T.keyword]],

    [
      /^([ \t]*)((?:left to right|right to left|top to bottom|bottom to top)[ \t]+direction)\b/,
      ["", T.keyword],
    ],

    // Embedded sub-languages
    [/^([ \t]*)(nwdiag|packetdiag|rackdiag)([ \t]*)(\{)/, ["", T.type, "", { token: T.curly, next: "@nwdiag" }]],
    [/^([ \t]*)(salt)([ \t]*)(?=\n|\{)/, ["", T.keyword, { token: "", next: "@saltWait" }]],
    [/^([ \t]*)(sprite)\b/, ["", { token: T.keyword, next: "@spriteHead" }]],

    // Declarations: `class Foo`, `participant "A" as a`, `state S {`
    [
      /^([ \t]*)((?:create[ \t]+)?)(@classTypesRe)(\/?)(?=[ \t]+["\w$\[({#]|[ \t]*\n|[ \t]*\{)/,
      ["", T.keyword, T.type, { token: T.operator, next: "@decl.class" }],
    ],
    [/^([ \t]*)(map)(?=[ \t]+["\w$])/, ["", { token: T.type, next: "@decl.map" }]],
    [/^([ \t]*)(json)(?=[ \t]+["\w$])/, ["", { token: T.type, next: "@decl.json" }]],
    [
      /^([ \t]*)((?:create[ \t]+)?)(@plainTypesRe)(\/?)(?=[ \t]+["\w$\[({#]|[ \t]*\n|[ \t]*\{)/,
      ["", T.keyword, T.type, { token: T.operator, next: "@decl.plain" }],
    ],
    [
      /^([ \t]*)(activate|deactivate|destroy|create)(?=[ \t]+["\w$])/,
      ["", { token: T.keyword, next: "@decl.plain" }],
    ],
    [/^([ \t]*)(@commandsRe)\b(?![ \t]*(?:[-<.=~]|:))/, ["", { token: T.keyword, next: "@commandLine" }]],

    // Timing anchors `@0`, `@+100`, `@clk*3`
    [/^([ \t]*)([@](?!start|end)[\w:+\-*.\/]+)/, ["", T.anchor]],
  ],

  swimlane: [
    popAtEol,
    [/\|/, T.delimiter],
    [/#\w+/, T.color],
    [/[^|#\n]+/, T.entity],
    [/./, ""],
  ],

  activityLabel: [
    recover,
    [/;(?=[ \t]*(?:<<[^>\n]*>>[ \t]*)?\n)/, T.delimiter, "@pop"],
    include("creoleMarkup"),
    [/[|<>\/\]}](?=[ \t]*\n)/, T.delimiter, "@pop"],
    [/\n/, ""],
    include("creolePlain"),
  ],

  conditionLine: [
    ws,
    popAtEol,
    [/\(/, T.paren, "@parenText"],
    include("quoted"),
    [/@color/, T.color],
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/-+>/, { token: T.arrow, switchTo: "@textLine" }],
    [/(?:then|is|not|equals|else)\b/, T.control],
    [/[\w\u00C0-\uFFFF]+/, T.text],
    [/./, T.text],
  ],
  parenText: [
    [/\)/, T.paren, "@pop"],
    popAtEol,
    [/\(/, T.text, "@parenTextNested"],
    include("creoleMarkup"),
    [/[^()\n]/, T.text],
  ],
  parenTextNested: [
    [/\)/, T.text, "@pop"],
    popAtEol,
    [/\(/, T.text, "@push"],
    include("creoleMarkup"),
    [/[^()\n]/, T.text],
  ],
  // `alt success`, `else failure`, `group My label [secondary]`, `loop #gold 3 times`
  groupLine: [
    ws,
    popAtEol,
    [/@color/, T.color],
    [/(?=[^\n])/, { token: "", switchTo: "@textLine" }],
  ],

  // The name being declared, then modifiers: `as`, stereotype, colour, generics, body
  decl: [
    ws,
    [/\[[^\]\n]+\]|\([^)\n]*\)|:[^:\n]+:/, { token: T.entity, switchTo: "@declRest.$S2" }],
    [/\$\w+(?=\()/, { token: T.call, switchTo: "@declRest.$S2" }],
    [/\$\w+/, { token: T.variable, switchTo: "@declRest.$S2" }],
    [/@ident(?:::@ident)*/, { token: T.identifier, switchTo: "@declRest.$S2" }],
    [/(?=[\s\S])/, { token: "", switchTo: "@declRest.$S2" }],
  ],
  declRest: [
    ws,
    popAtEol,
    [/\/'/, T.comment, "@blockComment"],
    // `usecase UC as "first line` ... `last line"`: a quoted label after `as` may span lines
    [/(as)([ \t]+)("[^"\n]*)(?=\n)/, [T.keyword, "", { token: T.string, switchTo: "@longString" }]],
    include("quoted"),
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/<(?=[^<>\n]*(?:<[^<>\n]*>[^<>\n]*)*>)/, T.angle, "@generic"],
    [/@color/, T.color],
    [
      /\{(?=[ \t]*\n)/,
      {
        cases: {
          "$S2==class": { token: T.curly, switchTo: "@classBody" },
          "$S2==map": { token: T.curly, switchTo: "@mapBody" },
          "$S2==json": { token: T.curly, switchTo: "@jsonBody" },
          "@default": T.curly,
        },
      },
    ],
    [/\[(?=[ \t]*\n)/, { token: T.square, switchTo: "@bracketBody" }],
    [/[{}]/, T.curly],
    [/::/, T.delimiter],
    [/:/, { token: T.delimiter, switchTo: "@textLine" }],
    [/\$\w+(?=\()/, T.call, "@callOpen"],
    [/\$\w+/, T.variable],
    [/@ident/, { cases: { "@declKeywords": T.keyword, "@default": T.identifier } }],
    [/\d+(?:\.\d+)?/, T.number],
    [/[()]/, T.paren],
    [/,/, T.delimiter],
    [/./, ""],
  ],
  longString: [recover, [/"/, T.string, "@pop"], [/\n/, ""], [/[^"\n]+/, T.string]],
  // `rectangle R [` ... `]`: a multi-line description
  bracketBody: [recover, [/\]/, T.square, "@pop"], [/\n/, ""], include("creoleMarkup"), [/[^\]\n]/, T.text]],

  generic: [
    [/>/, T.angle, "@pop"],
    [/</, T.angle, "@push"],
    [/(?:extends|super)\b/, T.keyword],
    [/[\w$\u00C0-\uFFFF.]+/, T.typeName],
    [/[ \t,?\[\]&]+/, T.delimiter],
    [/(?=[\s\S])/, "", "@pop"],
  ],

  // `<<stereotype>>`, `<< (S,#FF7700) Singleton >>`
  stereotype: [
    [/>>/, T.stereotype, "@pop"],
    [/(\()([^,()\n]+)(,)([ \t]*)(#?\w+)(\))/, [T.paren, T.constant, T.delimiter, "", T.color, T.paren]],
    [/\$[\w.\/-]+/, T.variable],
    [/[^>\n($]+|[>($]/, T.stereotype],
    [/(?=\n)/, "", "@pop"],
  ],

  classBody: [
    recover,
    include("comments"),
    include("preprocLine"),
    [/^([ \t]*)(\})/, ["", { token: T.curly, next: "@pop" }]],
    [
      /^([ \t]*)(-{2,}|\.{2,}|={2,}|_{2,})([^\n]*?)((?:-{2,}|\.{2,}|={2,}|_{2,})?)([ \t]*)(?=\n)/,
      ["", T.separator, T.heading, T.separator, ""],
    ],
    [/^([ \t]*)([-+#~*])(?![-+#~*=.>])/, ["", T.visibility]],
    [
      /(\{(?:static|abstract|classifier|field|method)\})([ \t]*)([-+#~])(?![-+#~=.>])/,
      [T.annotation, "", T.visibility],
    ],
    [/\{(?:static|abstract|classifier|field|method)\}/, T.annotation],
    ws,
    [/\n/, ""],
    include("quoted"),
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/<(?=[^<>\n]*(?:<[^<>\n]*>[^<>\n]*)*>)/, T.angle, "@generic"],
    [/@ident(?=[ \t]*\()/, T.method],
    [/(:)([ \t]*)(@ident(?:\[\])*)/, [T.delimiter, "", T.typeName]],
    [/\$\w+/, T.variable],
    [/@ident/, T.identifier],
    [/\d+(?:\.\d+)?/, T.number],
    [/\{/, T.curly, "@push"],
    [/\}/, T.curly, "@pop"],
    [/[()]/, T.paren],
    [/[\[\]]/, T.square],
    [/[,;:=]/, T.delimiter],
    [/./, ""],
  ],
  mapBody: [
    recover,
    include("comments"),
    [/\}/, T.curly, "@pop"],
    ws,
    [/\n/, ""],
    [/=>/, T.operator],
    [/\*-+>/, T.arrow],
    include("quoted"),
    [/\d+(?:\.\d+)?/, T.number],
    [/@ident/, T.identifier],
    [/./, ""],
  ],
  jsonBody: [recover, [/\{/, T.curly, "@push"], [/\}/, T.curly, "@pop"], include("jsonValue")],

  // hide / show / scale / autonumber ...: keywords are meaningful along the whole line
  commandLine: [
    ws,
    popAtEol,
    [/\/'/, T.comment, "@blockComment"],
    include("quoted"),
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/@color/, T.color],
    [/\d+x\d+|\d+(?:\.\d+)?%?/, T.number],
    [/::/, T.delimiter],
    [/:/, { token: T.delimiter, switchTo: "@textLine" }],
    [/[@]unlinked\b/, T.keyword],
    [/\$\w+/, T.variable],
    [/@ident/, { cases: { "@typeKeywords": T.type, "@commandWords": T.keyword, "@default": T.identifier } }],
    [/[{}]/, T.curly],
    [/[()]/, T.paren],
    [/[\[\]]/, T.square],
    [/./, ""],
  ],

  spriteHead: [
    ws,
    popAtEol,
    [/\$?[\w.]+/, { token: T.variable, switchTo: "@spriteRest" }],
    [/(?=[^\n])/, { token: "", switchTo: "@spriteRest" }],
  ],
  spriteRest: [
    ws,
    popAtEol,
    [/\[[^\]\n]*\]/, T.number],
    [/\{(?=[ \t]*\n)/, { token: T.curly, switchTo: "@spriteBody" }],
    [/<svg\b/, { token: T.raw, switchTo: "@svgBody" }],
    [/[^\s]+/, T.string],
  ],
  spriteBody: [recover, [/\}/, T.curly, "@pop"], [/\n/, ""], [/[^}\n]+/, T.raw]],
  svgBody: [recover, [/<\/svg>/, T.raw, "@pop"], [/\n/, ""], [/[^<\n]+|</, T.raw]],

  // ── Inline tokens: whatever a line contains after classification ────────

  arrows: [
    // Sequence activation shorthand after the target: `A -> B ++`, `B --> A --`, `--++ #gold`
    [/(?:\+\+|--|\*\*|!!)+(?=[ \t]*(?:#\w+[ \t]*)?(?::|\n))/, T.operator],
    // Lollipop and socket connectors: `-(0-`, `-0)-`, `--(`, `0--`
    [/[-.]+(?:\(0\)|\(0|0\)|0)[-.]+>?|[-.]+(?:\(0\)|\(0|0\)|[(0)])(?=[ \t])|(?:\(0\)|\(0|0\)|[)0])[-.]+>?/, T.arrow],
    [/((?:\[|\?)?@arrowHL?[-.=~]+)(\[)(?=[^\]\n]*\])/, [T.arrow, { token: T.arrow, next: "@arrowStyle" }]],
    [
      /(?:\[|\?)?(?:@arrowHL[-.=~]+@arrowDir?[-.=~]*@arrowHR?|[-.=~]+@arrowDir?[-.=~]*@arrowHR|(?:-+|\.{2,}|={2,}|~{2,})(?:@arrowDir[-.=~]+)?)@arrowGate?/,
      T.arrow,
    ],
  ],
  // Inside `-[#red,dashed]->`
  arrowStyle: [
    [/#\w+/, T.color],
    [/[A-Za-z]+/, T.keyword],
    [/\d+/, T.number],
    [/\]/, { token: T.arrow, switchTo: "@arrowTail" }],
    [/(?=\n)/, "", "@pop"],
    [/./, T.delimiter],
  ],
  arrowTail: [
    [/@arrowDir?[-.=~]+@arrowHR?@arrowGate?/, T.arrow, "@pop"],
    [/@arrowHR@arrowGate?/, T.arrow, "@pop"],
    [/(?=[\s\S])/, "", "@pop"],
  ],
  arrowStyleLabel: [
    [/#\w+/, T.color],
    [/[A-Za-z]+/, T.keyword],
    [/\d+/, T.number],
    [/(\])([-.]*>)/, [T.arrow, { token: T.arrow, switchTo: "@activityLabel" }]],
    [/(?=\n)/, "", "@pop"],
    [/./, T.delimiter],
  ],

  callOpen: [
    [/\(/, { token: T.paren, switchTo: "@callArgs" }],
    [/(?=[\s\S])/, "", "@pop"],
  ],
  callArgs: [
    ws,
    popAtEol,
    [/\)/, T.paren, "@pop"],
    [/\(/, T.paren, "@push"],
    include("quoted"),
    [/\$\w+(?=[ \t]*=)/, T.param],
    [/\$\w+(?=\()/, T.call],
    [/\$\w+/, T.variable],
    [/%\w+(?=\()/, T.builtin],
    [/@color/, T.color],
    [/\d+(?:\.\d+)?/, T.number],
    [/@ident/, T.identifier],
    [/[,=]/, T.delimiter],
    [/./, ""],
  ],

  umlInline: [
    ws,
    [/\n/, ""],
    [/\/'/, T.comment, "@blockComment"],
    include("quoted"),
    [/\[\[[^\]\n]*\]\]/, T.link],
    [/\[\*\]|\[H\*?\]|\(\*(?:top)?\)/, T.constant],
    // A trailing negative value (`LD is -3`), not a line connector
    [/-\d+(?:\.\d+)?(?=[ \t]*(?:\n|:|#))/, T.number],
    // Legacy activity synchronisation bar `===B1===`
    [/={3}[^=\n]+={3}/, T.entity],
    include("arrows"),
    [/<<(?!<)/, T.stereotype, "@stereotype"],
    [/<(?=[\w?][^<>\n]*(?:<[^<>\n]*>[^<>\n]*)*>)/, T.angle, "@generic"],
    [/::/, T.delimiter],
    [/:[^\s:][^:\n]*:(?=[ \t]*(?:\n|as[ \t]|<<|[ox*+#^]?[-.~=]|<[-.|~=]))/, T.entity],
    [/:/, T.delimiter, "@textLine"],
    [/@color/, T.color],
    [/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/, T.date],
    [/\d+(?:\.\d+)?%?/, T.number],
    [/%\w+(?=\()/, T.builtin, "@callOpen"],
    [/\$\w+(?=\()/, T.call, "@callOpen"],
    [/\$\w+/, T.variable],
    [/@ident(?=\()/, T.call, "@callOpen"],
    [/@ident/, { cases: { "@inlineKeywords": T.keyword, "@default": T.identifier } }],
    [/\(\)|\([^()\n]+\)/, T.entity],
    [/\[[^\[\]\n]+\]/, T.entity],
    [/[@](?!start|end)[\w:+\-*.\/]+/, T.anchor],
    [/[{}]/, T.curly],
    [/[()]/, T.paren],
    [/[\[\]]/, T.square],
    [/[,;]/, T.delimiter],
    [/./, ""],
  ],
};
