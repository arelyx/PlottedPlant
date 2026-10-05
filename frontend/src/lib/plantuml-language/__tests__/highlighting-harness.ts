import { compile } from "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js";
import { MonarchTokenizer } from "monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js";
import { plantumlMonarchLanguage } from "../monaco/tokenizer";

/**
 * Runs the real Monarch engine over the PlantUML grammar in Node. Only the
 * services the lexer touches are stubbed; no editor or DOM is involved, so
 * embedded languages are unavailable (the grammar does not use any).
 */
const languageService = {
  languageIdCodec: { encodeLanguageId: () => 1, decodeLanguageId: () => "plantuml" },
  isRegisteredLanguageId: () => false,
  getLanguageIdByLanguageName: () => null,
  getLanguageIdByMimeType: () => null,
  requestBasicLanguageFeatures: () => undefined,
};
const configurationService = {
  getValue: () => 20000,
  onDidChangeConfiguration: () => ({ dispose: () => undefined }),
};

const tokenizer = new MonarchTokenizer(
  languageService,
  null,
  "plantuml",
  compile("plantuml", plantumlMonarchLanguage),
  configurationService,
);

export interface Tok {
  text: string;
  /** Token class without the ".plantuml" postfix; "" for unstyled text. */
  type: string;
}

export interface TokenizedLine {
  tokens: Tok[];
  /** State stack after the line, outermost first: ["root", "noteBody"]. */
  stack: string[];
}

export function tokenize(source: string): TokenizedLine[] {
  let state = tokenizer.getInitialState();
  return source.split(/\r?\n/).map((line) => {
    const result = tokenizer.tokenize(line, true, state);
    state = result.endState;
    const tokens = result.tokens.map((t, i) => ({
      text: line.slice(t.offset, result.tokens[i + 1]?.offset ?? line.length),
      type: t.type.replace(/\.plantuml$/, ""),
    }));
    const stack: string[] = [];
    for (let e: typeof state.stack | null = state.stack; e; e = e.parent) stack.unshift(e.state);
    return { tokens, stack };
  });
}

/**
 * Tokens of one line as compact "text‹type›" strings, whitespace dropped.
 * `prefix` lines set up context (e.g. "@startgantt") and are not returned.
 */
export function line(source: string, prefix: string[] = []): string[] {
  const lines = tokenize([...prefix, source].join("\n"));
  return lines[prefix.length].tokens
    .filter((t) => t.text.trim() !== "")
    .map((t) => `${t.text.trim()}‹${t.type}›`);
}

/** The class of the token that covers the first occurrence of `needle` in a line. */
export function classOf(source: string, needle: string, prefix: string[] = []): string {
  const lines = tokenize([...prefix, source].join("\n"));
  const at = source.indexOf(needle);
  if (at < 0) throw new Error(`"${needle}" is not in "${source}"`);
  let offset = 0;
  for (const t of lines[prefix.length].tokens) {
    if (at >= offset && at < offset + t.text.length) return t.type;
    offset += t.text.length;
  }
  return "";
}

/** Tokenize a single line from a given state; for tests that replay partial input. */
export function tokenizeLine(text: string, state = tokenizer.getInitialState()) {
  return tokenizer.tokenize(text, true, state);
}
