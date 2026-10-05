import type { DiagramKind, DocEntry } from "./types";

/**
 * A documentation entry plus what is needed to index it and to check its
 * example against a real PlantUML server (scripts/validate-plantuml-content.mjs).
 */
export interface DocRecord extends DocEntry {
  /** Terms this entry answers to. Matched case-insensitively, spaces collapsed. */
  terms: string[];
  /** Diagram kinds where this meaning applies. Omitted: the kind-less default. */
  kinds?: DiagramKind[];
  /** Validation only: lines placed before the example inside the wrapper. */
  setup?: string;
  /** Validation only: @start tag to wrap a fragment in when `kinds` does not imply it. */
  tag?: string;
  /** Validation only: diagram type the server must report; null disables the check. */
  expect?: string | null;
  /** Validation only: why the sandboxed server cannot check this example. */
  skip?: string;
}

const KIND_SET: Record<DiagramKind, true> = {
  sequence: true,
  class: true,
  object: true,
  usecase: true,
  activity: true,
  "activity-legacy": true,
  state: true,
  component: true,
  deployment: true,
  er: true,
  timing: true,
  nwdiag: true,
  archimate: true,
  gantt: true,
  mindmap: true,
  wbs: true,
  salt: true,
  json: true,
  yaml: true,
  ebnf: true,
  regex: true,
  chen: true,
  ditaa: true,
  dot: true,
  math: true,
  latex: true,
  chronology: true,
  other: true,
  unknown: true,
};

/** Every DiagramKind, kept exhaustive by the Record type above. */
export const ALL_KINDS = Object.keys(KIND_SET) as DiagramKind[];

/** plantuml.com pages that documentation entries may link to. */
export const LINKS = {
  sequence: "https://plantuml.com/sequence-diagram",
  usecase: "https://plantuml.com/use-case-diagram",
  class: "https://plantuml.com/class-diagram",
  object: "https://plantuml.com/object-diagram",
  activity: "https://plantuml.com/activity-diagram-beta",
  activityLegacy: "https://plantuml.com/activity-diagram-legacy",
  component: "https://plantuml.com/component-diagram",
  deployment: "https://plantuml.com/deployment-diagram",
  state: "https://plantuml.com/state-diagram",
  timing: "https://plantuml.com/timing-diagram",
  er: "https://plantuml.com/ie-diagram",
  chen: "https://plantuml.com/er-diagram",
  nwdiag: "https://plantuml.com/nwdiag",
  archimate: "https://plantuml.com/archimate-diagram",
  gantt: "https://plantuml.com/gantt-diagram",
  mindmap: "https://plantuml.com/mindmap-diagram",
  wbs: "https://plantuml.com/wbs-diagram",
  salt: "https://plantuml.com/salt",
  json: "https://plantuml.com/json",
  yaml: "https://plantuml.com/yaml",
  ebnf: "https://plantuml.com/ebnf",
  regex: "https://plantuml.com/regex",
  ditaa: "https://plantuml.com/ditaa",
  dot: "https://plantuml.com/dot",
  math: "https://plantuml.com/ascii-math",
  preprocessing: "https://plantuml.com/preprocessing",
  skinparam: "https://plantuml.com/skinparam",
  style: "https://plantuml.com/style-evolution",
  creole: "https://plantuml.com/creole",
  color: "https://plantuml.com/color",
  theme: "https://plantuml.com/theme",
  stdlib: "https://plantuml.com/stdlib",
  link: "https://plantuml.com/link",
  sprite: "https://plantuml.com/sprite",
  openiconic: "https://plantuml.com/openiconic",
  commons: "https://plantuml.com/commons",
} as const;

/** Lower-case a term and collapse inner whitespace, as used for index keys. */
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}
