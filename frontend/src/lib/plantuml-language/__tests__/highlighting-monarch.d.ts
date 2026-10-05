// Monaco ships its Monarch engine as untyped ESM modules. The highlighting
// tests drive it directly, so they can run in Node without a DOM.
declare module "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js" {
  export function compile(languageId: string, definition: unknown): unknown;
}

declare module "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js" {
  export interface MonarchStackElement {
    state: string;
    parent: MonarchStackElement | null;
  }
  export interface MonarchLineState {
    stack: MonarchStackElement;
  }
  export class MonarchTokenizer {
    constructor(
      languageService: unknown,
      standaloneThemeService: unknown,
      languageId: string,
      lexer: unknown,
      configurationService: unknown,
    );
    getInitialState(): MonarchLineState;
    tokenize(
      line: string,
      hasEOL: boolean,
      state: MonarchLineState,
    ): { tokens: { offset: number; type: string }[]; endState: MonarchLineState };
  }
}
