import type * as Monaco from "monaco-editor";
import { languageConfiguration } from "./language-config";
import { plottedPlantDark, plottedPlantLight } from "./themes";
import { plantumlMonarchLanguage } from "./tokenizer";

/** Monarch tokenizer, language configuration and the light/dark editor themes. */
export function registerHighlighting(monaco: typeof Monaco): void {
  monaco.editor.defineTheme("plottedplant-light", plottedPlantLight);
  monaco.editor.defineTheme("plottedplant-dark", plottedPlantDark);
  monaco.languages.setMonarchTokensProvider("plantuml", plantumlMonarchLanguage);
  monaco.languages.setLanguageConfiguration("plantuml", languageConfiguration(monaco));
}
