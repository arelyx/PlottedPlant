import type * as Monaco from "monaco-editor";

/** Editor options the PlantUML language support relies on. Spread into every PlantUML editor. */
export const PLANTUML_EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  "semanticHighlighting.enabled": true,
  // The language service supplies symbol completions; Monaco's guess-from-words list only adds noise.
  wordBasedSuggestions: "off",
  // Lets the language configuration's indentation rules outdent closers (`end`, `endif`, `}`) as they are typed.
  autoIndent: "full",
  // Lets the on-type formatter snap `end`, `else`, `}`… to the indentation of the line that opened the block.
  formatOnType: true,
  // Enter on a suggestion that would change nothing (a fully typed name or keyword) starts a new line instead.
  acceptSuggestionOnEnter: "smart",
  // Hovers and menus may extend past the editor pane instead of being clipped at its edge.
  fixedOverflowWidgets: true,
};
