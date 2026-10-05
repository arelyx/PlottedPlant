import type * as Monaco from "monaco-editor";
import { T } from "./tokenizer-tokens";

/**
 * Editor themes for PlantUML. One hue per role, so a reader can tell
 * structure from names from prose at a glance:
 *
 *   blue    statements (note, title, hide, skinparam)
 *   cyan    element types (participant, class, node), property names, and in
 *           italics the stereotypes and member modifiers that qualify them
 *   purple  control flow (alt/else/end, if/while, fork)
 *   violet  the meta layer: @start/@end tags, !directives, macro calls
 *   rose    preprocessor variables and parameters
 *   orange  arrows and operators
 *   green   display text: quoted names, message text, labels, note bodies
 *   gold    literal values: colours, numbers, dates, [*]
 *   ink     names the language service resolved to a declaration (semantic tokens)
 *
 * Every text colour has a WCAG contrast ratio of at least 4.5:1 against the
 * theme's editor background (checked by highlighting-themes.test.ts).
 */
export interface Palette {
  background: string;
  foreground: string;
  comment: string;
  punctuation: string;
  statement: string;
  type: string;
  control: string;
  meta: string;
  variable: string;
  arrow: string;
  text: string;
  value: string;
  symbol: string;
  // Editor chrome
  lineHighlight: string;
  lineNumber: string;
  lineNumberActive: string;
  selection: string;
  indentGuide: string;
}

// Backgrounds follow the app: white in light mode, the card surface (oklch 0.205) in dark mode.
export const lightPalette: Palette = {
  background: "#FFFFFF",
  foreground: "#1F2937",
  comment: "#5F6B7A",
  punctuation: "#5F6B7A",
  statement: "#1D4ED8",
  type: "#0E7490",
  control: "#A21CAF",
  meta: "#6D28D9",
  variable: "#BE185D",
  arrow: "#C2410C",
  text: "#15803D",
  value: "#8A5A00",
  symbol: "#0B3A75",
  lineHighlight: "#F5F5F5",
  lineNumber: "#A3A3A3",
  lineNumberActive: "#404040",
  selection: "#BFDBFE",
  indentGuide: "#E5E5E5",
};

export const darkPalette: Palette = {
  background: "#171717",
  foreground: "#E5E5E5",
  comment: "#8B949E",
  punctuation: "#A1A1AA",
  statement: "#7CACF8",
  type: "#4EC9B0",
  control: "#D8A1F5",
  meta: "#B4A0FF",
  variable: "#F28FB8",
  arrow: "#FF9E64",
  text: "#9ECE6A",
  value: "#E0AF68",
  symbol: "#A6C8FF",
  lineHighlight: "#212121",
  lineNumber: "#6B6B6B",
  lineNumberActive: "#D4D4D4",
  selection: "#1F3B5C",
  indentGuide: "#2E2E2E",
};

type FontStyle = "italic" | "bold" | "underline" | "strikethrough" | "bold italic" | "";

/** The colour and style of every token class, for the contrast test and the theme rules. */
export function tokenStyles(p: Palette): Record<string, { color: string; fontStyle?: FontStyle }> {
  return {
    "": { color: p.foreground },
    [T.identifier]: { color: p.foreground },
    [T.entity]: { color: p.foreground },
    [T.raw]: { color: p.foreground },
    [T.comment]: { color: p.comment, fontStyle: "italic" },
    [T.delimiter]: { color: p.punctuation },
    [T.tag]: { color: p.meta, fontStyle: "bold" },
    [T.tagArgs]: { color: p.punctuation, fontStyle: "" },
    [T.directive]: { color: p.meta },
    [T.call]: { color: p.meta },
    [T.keyword]: { color: p.statement },
    [T.type]: { color: p.type },
    [T.control]: { color: p.control },
    [T.marker]: { color: p.arrow, fontStyle: "bold" },
    [T.separator]: { color: p.punctuation, fontStyle: "bold" },
    [T.operator]: { color: p.arrow },
    [T.arrow]: { color: p.arrow },
    [T.color]: { color: p.value },
    [T.constant]: { color: p.value },
    [T.anchor]: { color: p.value },
    [T.number]: { color: p.value },
    [T.string]: { color: p.text },
    [T.escape]: { color: p.value },
    [T.key]: { color: p.type },
    [T.text]: { color: p.text },
    [T.bold]: { color: p.text, fontStyle: "bold" },
    [T.italic]: { color: p.text, fontStyle: "italic" },
    [T.underline]: { color: p.text, fontStyle: "underline" },
    [T.strike]: { color: p.text, fontStyle: "strikethrough" },
    [T.mono]: { color: p.value },
    [T.markup]: { color: p.punctuation },
    [T.link]: { color: p.statement, fontStyle: "underline" },
    [T.icon]: { color: p.value },
    [T.heading]: { color: p.text, fontStyle: "bold" },
    [T.stereotype]: { color: p.type, fontStyle: "italic" },
    [T.annotation]: { color: p.type },
    [T.method]: { color: p.foreground },
    [T.typeName]: { color: p.type },
    [T.variable]: { color: p.variable },
    [T.param]: { color: p.variable, fontStyle: "italic" },
    [T.attrName]: { color: p.type },
    [T.attrValue]: { color: p.foreground },
    [T.selector]: { color: p.statement },
    [T.regexp]: { color: p.text },
    [T.regexpEscape]: { color: p.value },
    [T.regexpClass]: { color: p.type },
    [T.regexpOperator]: { color: p.arrow },

    // Semantic token types from the language service (declared symbols).
    class: { color: p.symbol },
    type: { color: p.symbol },
    namespace: { color: p.symbol },
    variable: { color: p.symbol },
    property: { color: p.symbol },
    enumMember: { color: p.value },
    function: { color: p.meta },
    macro: { color: p.meta },
    parameter: { color: p.variable, fontStyle: "italic" },
  };
}

function themeData(base: "vs" | "vs-dark", p: Palette): Monaco.editor.IStandaloneThemeData {
  const hex = (color: string) => color.slice(1);
  return {
    base,
    inherit: true,
    rules: Object.entries(tokenStyles(p)).map(([token, style]) => ({
      token,
      foreground: hex(style.color),
      ...(style.fontStyle === undefined ? {} : { fontStyle: style.fontStyle }),
    })),
    colors: {
      "editor.background": p.background,
      "editor.foreground": p.foreground,
      "editor.lineHighlightBackground": p.lineHighlight,
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": p.lineNumber,
      "editorLineNumber.activeForeground": p.lineNumberActive,
      "editor.selectionBackground": p.selection,
      "editorIndentGuide.background1": p.indentGuide,
      "editorGutter.background": p.background,
    },
  };
}

export const plottedPlantLight = themeData("vs", lightPalette);
export const plottedPlantDark = themeData("vs-dark", darkPalette);
