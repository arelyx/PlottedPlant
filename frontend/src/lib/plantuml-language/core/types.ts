/**
 * Shared types for the PlantUML language service.
 *
 * Everything under core/ is plain TypeScript over strings with no Monaco
 * import, so it can be unit-tested in Node and later wrapped by a language
 * server without changes. Lines and columns in core/ are 0-based; the Monaco
 * adapters under monaco/ convert to Monaco's 1-based positions.
 */

/** What a diagram block contains. `@startuml` blocks are refined by content. */
export type DiagramKind =
  | "sequence"
  | "class"
  | "object"
  | "usecase"
  | "activity"
  | "activity-legacy"
  | "state"
  | "component"
  | "deployment"
  | "er"
  | "timing"
  | "nwdiag"
  | "archimate"
  | "gantt"
  | "mindmap"
  | "wbs"
  | "salt"
  | "json"
  | "yaml"
  | "ebnf"
  | "regex"
  | "chen"
  | "ditaa"
  | "dot"
  | "math"
  | "latex"
  | "chronology"
  | "other"
  | "unknown";

export interface DiagramBlock {
  /** Tag without the @start prefix, lower-cased: "uml", "mindmap", ... */
  tag: string;
  kind: DiagramKind;
  /** Line of the @start tag (0-based). */
  startLine: number;
  /** Line of the matching @end tag, or the last line of the document if unclosed. */
  endLine: number;
  closed: boolean;
}

export interface Range {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** Hover/completion documentation for a keyword, type, directive or skinparam. */
export interface DocEntry {
  /** Short signature or usage line, shown in code font. */
  signature?: string;
  /** Markdown body. */
  body: string;
  /** A small, valid example. */
  example?: string;
  /** Link to the relevant plantuml.com page. */
  link?: string;
}

export interface Snippet {
  /** Text typed to trigger it, also the label. */
  prefix: string;
  description: string;
  /** Monaco/VS Code snippet syntax ($1, ${2:placeholder}, $0). */
  body: string;
  /** Diagram kinds it applies to, or "any". "top" means outside any @start block. */
  scope: DiagramKind[] | "any" | "top";
}
