import type * as Monaco from "monaco-editor";

export type Rule = Monaco.languages.IMonarchLanguageRule;
export type States = Record<string, Rule[]>;

/**
 * Token classes emitted by the PlantUML grammar (Monarch appends ".plantuml").
 *
 * Names matter beyond colour: Monaco treats any token whose name contains
 * "string" or "comment" as string/comment content, which keeps bracket
 * matching and quick suggestions out of prose (message text, note bodies,
 * activity labels). That is why prose is `string.text` rather than `text`.
 */
export const T = {
  comment: "comment",
  tag: "metatag",
  tagArgs: "metatag.argument",
  directive: "keyword.directive",
  keyword: "keyword",
  control: "keyword.control",
  type: "keyword.type",
  marker: "keyword.marker",
  separator: "keyword.separator",
  arrow: "operator.arrow",
  operator: "operator",
  delimiter: "delimiter",
  curly: "delimiter.curly",
  square: "delimiter.square",
  paren: "delimiter.parenthesis",
  angle: "delimiter.angle",
  color: "constant.color",
  constant: "constant.language",
  anchor: "constant.anchor",
  number: "number",
  date: "number.date",
  string: "string",
  escape: "string.escape",
  key: "string.key",
  text: "string.text",
  bold: "string.text.bold",
  italic: "string.text.italic",
  underline: "string.text.underline",
  strike: "string.text.strike",
  mono: "string.text.code",
  markup: "string.text.tag",
  link: "string.text.link",
  icon: "string.text.icon",
  heading: "string.text.heading",
  stereotype: "annotation.stereotype",
  annotation: "annotation",
  visibility: "annotation.visibility",
  identifier: "identifier",
  entity: "identifier.entity",
  call: "identifier.function",
  builtin: "identifier.function.builtin",
  method: "identifier.method",
  typeName: "type.identifier",
  variable: "variable.preprocessor",
  param: "variable.parameter",
  attrName: "attribute.name",
  attrValue: "attribute.value",
  selector: "tag.selector",
  raw: "source.raw",
  regexp: "regexp",
  regexpEscape: "regexp.escape",
  regexpClass: "regexp.class",
  regexpOperator: "regexp.operator",
} as const;

export const include = (state: string): Rule => ({ include: `@${state}` });

/** Regex alternation of literal words, longest first so prefixes never win. */
export function alternation(words: readonly string[]): string {
  return [...new Set(words)]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .join("|");
}

/**
 * Shared sub-patterns, referenced from rule regexes as `@name` (Monarch
 * substitutes them). A literal "@" in a rule must therefore be written `[@]`.
 *
 * The lexer runs with `includeLF`, so every line ends in "\n": line-scoped
 * states pop on it, and character classes must exclude it explicitly.
 */
export const PATTERNS = {
  ident: String.raw`[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*(?:\.[\w\u00C0-\uFFFF]+)*`,
  // #red, #FF8800, #red/blue gradients, #back;line:red;text:blue, ##[dashed]green
  color: String.raw`#(?:#(?:\[\w+\])?\w+|(?:line|text|back)[.:]#?\w+|\w+)(?:[\/|\\]#?\w+|-#?[A-Za-z0-9]+\b(?![-.>]))?(?:;(?:(?:line|text|back)[.:])?#?[\w.]+)*`,
  quoted: String.raw`"[^"\n]*"?`,
  // Arrow pieces. Letter heads (o, x) only count when glued to a line body.
  arrowHL: String.raw`(?:[ox]?(?:<<|<\||<)|[ox](?=-|\.\.|==|~~)|[*+#^]|\}[o|]?|\|[o|]|\(\)|\\\\|\/\/|\\|\/)`,
  arrowHR: String.raw`(?:(?:\|>|>>|>)(?:[ox](?!\w))?|[o|]\{|o\||\|\||\{|[*+^]|[ox#](?!\w)|\(\)|\\\\|\/\/|\\|\/)`,
  arrowDir: String.raw`(?:(?:up|down|left|right|le|ri|do|u|d|l|r)(?=[-.=~]))`,
  arrowGate: String.raw`(?:\](?![\w\]])|\?)`,
} as const;
