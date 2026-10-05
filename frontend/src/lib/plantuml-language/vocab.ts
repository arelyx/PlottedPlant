import raw from "./data/vocab.generated.json";

/**
 * PlantUML's own vocabulary, generated from the rendering engine's word lists
 * by scripts/generate-plantuml-vocab.mjs. Do not hand-edit the JSON.
 */
export interface Vocab {
  /** Element types: participant, class, database, ... */
  types: string[];
  /** Diagram tags without the @start prefix: uml, mindmap, gantt, ... */
  startTags: string[];
  /** Language keywords (some are multi-word, e.g. "left to right direction"). */
  keywords: string[];
  /** Preprocessor directives without the leading "!". */
  preprocessor: string[];
  skinparams: string[];
  colors: string[];
  themes: string[];
  /** OpenIconic names usable as <&name>. */
  icons: string[];
  /** Emoji shortcut names usable as <:name:>. */
  emojis: string[];
}

export const vocab: Vocab = raw;
