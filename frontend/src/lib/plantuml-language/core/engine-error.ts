/**
 * Presentation of errors reported by the rendering engine (as opposed to the
 * lint in diagnostics.ts). Kept free of other imports: the render client uses it.
 */

const DIAGRAM_TYPE_NAMES: Record<string, string> = {
  description: "component, deployment or use case",
  activity3: "activity",
  nwdiag: "network",
  wbs: "WBS",
  json: "JSON",
  yaml: "YAML",
};

/**
 * Turn the engine's terse error text into a sentence. The engine appends the
 * diagram type it settled on, which is worth keeping: a wrong guess there is
 * often the real explanation for the error.
 */
export function describeEngineError(message: string): string {
  const assumed = /\s*\(Assumed diagram type: ([\w-]+)\)\s*$/i.exec(message);
  const base = (assumed ? message.slice(0, assumed.index) : message).trim();
  const type = assumed ? (DIAGRAM_TYPE_NAMES[assumed[1].toLowerCase()] ?? assumed[1].toLowerCase()) : null;
  const diagram = type ? `${/^[aeiou]/i.test(type) ? "an" : "a"} ${type} diagram` : null;
  if (/^syntax error\??$/i.test(base) || base === "") {
    return diagram
      ? `Syntax error: PlantUML cannot read this line as part of ${diagram}.`
      : "Syntax error: PlantUML cannot read this line.";
  }
  const sentence = base.replace(/[.\s]+$/, "");
  return diagram ? `${sentence} (PlantUML is reading this as ${diagram}).` : `${sentence}.`;
}

/** Columns of the meaningful part of a line: first to last non-blank character (end exclusive). */
export function contentColumns(line: string): { start: number; end: number } {
  const start = line.length - line.trimStart().length;
  const end = line.trimEnd().length;
  return end > start ? { start, end } : { start: 0, end: line.length };
}
