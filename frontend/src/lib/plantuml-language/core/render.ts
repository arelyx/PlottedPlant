import type { DiagramKind, DocEntry } from "./types";
import { lookupDoc } from "./docs";

/** Markdown for a documentation entry, as shown in hovers and completion details. */
export function renderDoc(entry: DocEntry): string {
  const parts: string[] = [];
  if (entry.signature) parts.push(codeBlock(entry.signature));
  parts.push(entry.body);
  if (entry.example) parts.push(codeBlock(entry.example));
  if (entry.link) parts.push(`[PlantUML reference](${entry.link})`);
  return parts.join("\n\n");
}

export function codeBlock(source: string): string {
  return "```plantuml\n" + source + "\n```";
}

/** Rendered documentation for a term, or undefined when none is recorded. */
export function docMarkdown(term: string, kind?: DiagramKind): string | undefined {
  const entry = lookupDoc(term, kind);
  return entry ? renderDoc(entry) : undefined;
}

const KIND_LABELS: Record<DiagramKind, string> = {
  sequence: "Sequence diagram",
  class: "Class diagram",
  object: "Object diagram",
  usecase: "Use case diagram",
  activity: "Activity diagram",
  "activity-legacy": "Activity diagram (legacy syntax)",
  state: "State diagram",
  component: "Component diagram",
  deployment: "Deployment diagram",
  er: "Entity-relationship diagram",
  timing: "Timing diagram",
  nwdiag: "Network diagram",
  archimate: "ArchiMate diagram",
  gantt: "Gantt chart",
  mindmap: "Mind map",
  wbs: "Work breakdown structure",
  salt: "Salt wireframe",
  json: "JSON data",
  yaml: "YAML data",
  ebnf: "EBNF grammar",
  regex: "Regular expression",
  chen: "Chen ER diagram",
  ditaa: "Ditaa diagram",
  dot: "Graphviz DOT",
  math: "AsciiMath formula",
  latex: "LaTeX formula",
  chronology: "Chronology",
  other: "Diagram",
  unknown: "Diagram",
};

export function kindLabel(kind: DiagramKind): string {
  return KIND_LABELS[kind];
}
