import type * as Monaco from "monaco-editor";
import { registerHighlighting } from "./monaco/highlighting";
import { registerIntelligence } from "./monaco/intelligence";
import { registerAuthoring } from "./monaco/authoring";

export const PLANTUML_LANGUAGE_ID = "plantuml";

/** Monaco theme name for the app's resolved light/dark theme. */
export function plantumlTheme(resolvedTheme: "light" | "dark"): string {
  return resolvedTheme === "dark" ? "plottedplant-dark" : "plottedplant-light";
}

/**
 * Register PlantUML language support with Monaco: highlighting and themes,
 * IntelliSense providers, and authoring aids. Pass as the editor's
 * `beforeMount` so themes exist before the first paint.
 * Safe to call multiple times — skips if already registered.
 */
export function registerPlantUMLLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === PLANTUML_LANGUAGE_ID)) return;

  // Dev-only handle so browser test scripts can drive Monaco (tokenize, trigger providers).
  if (import.meta.env.DEV) (window as unknown as { __monaco?: typeof Monaco }).__monaco = monaco;

  monaco.languages.register({ id: PLANTUML_LANGUAGE_ID });
  registerHighlighting(monaco);
  registerIntelligence(monaco);
  registerAuthoring(monaco);
}

export { PLANTUML_EDITOR_OPTIONS } from "./editor-options";
