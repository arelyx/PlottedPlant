import type * as Monaco from "monaco-editor";

// Lines after which the next line is indented. A participant may be named
// like a keyword (`loop -> x`), so an arrow or colon straight after rules it out.
const NOT_A_NAME = String.raw`(?!\s*(?:[-<.=~]|:\s))`;
const OPEN_WORDS = [
  String.raw`(?:alt|opt|loop|par2?|critical|group|box|else|also|while|switch|case|fork|split)\b${NOT_A_NAME}`,
  String.raw`(?:if|elseif|else\s+if)\b${NOT_A_NAME}`,
  String.raw`(?:fork|split)\s+again\b`,
  String.raw`repeat\b(?!\s*while)${NOT_A_NAME}`,
  // Multi-line prose blocks: a note without ": text", or a bare title/legend/header/footer line
  String.raw`(?:\/\s*)?(?:floating\s+)?[rh]?note\b(?!\s+"[^"]*"\s+as\b)(?:[^:]|::)*$`,
  String.raw`ref\s+over\b[^:]*$`,
  String.raw`(?:(?:left|right|center)\s+)?(?:title|header|footer|caption)\s*$`,
  String.raw`legend(?:\s+(?:left|right|top|bottom|center))*\s*$`,
  String.raw`<style>\s*$`,
  String.raw`!(?:if|ifdef|ifndef|else|elseif|while|foreach|definelong|(?:(?:unquoted|final)\s+)*(?:procedure|function))\b(?!.*!return\b)`,
];
const OPEN_BRACKET = String.raw`.*[{\[]\s*$`;
// Salt layouts open with `{+`, `{#`, `{^"title"` and friends
const OPEN_SALT = String.raw`.*\{(?:[+#!*\/-]|\^"[^"]*"|T[+#!-]?|S[I-]?)\s*$`;

// Lines that sit one level back out.
const CLOSE_WORDS = [
  String.raw`[}\]]`,
  String.raw`end\s*(?:note|rnote|hnote|ref|legend|title|header|footer|caption|box|fork|merge|split|group|while|switch|if|repeat)?\b${NOT_A_NAME}`,
  String.raw`(?:endif|endwhile|endswitch|endfork|endmerge|endsplit)\b`,
  String.raw`(?:else|elseif|else\s+if|case|also)\b${NOT_A_NAME}`,
  String.raw`(?:fork|split)\s+again\b`,
  String.raw`repeat\s*while\b`,
  String.raw`!(?:endif|else|elseif|endwhile|endfor|endprocedure|endfunction|enddefinelong)\b`,
  String.raw`<\/style>`,
];

const increaseIndentPattern = new RegExp(`^\\s*(?:${OPEN_WORDS.join("|")})|^${OPEN_BRACKET}|^${OPEN_SALT}`);
const decreaseIndentPattern = new RegExp(`^\\s*(?:${CLOSE_WORDS.join("|")})`);

/**
 * Editing behaviour while typing: comment toggling, bracket pairs, word
 * boundaries and indentation after block openers/closers. Folding and
 * formatting are provided separately by the authoring module.
 */
export function languageConfiguration(monaco: typeof Monaco): Monaco.languages.LanguageConfiguration {
  const { IndentAction } = monaco.languages;
  return {
    comments: { lineComment: "'", blockComment: ["/'", "'/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    // No rainbow brackets: `[*]`, `-[#red]->`, `}o--o{` and `--(` are not nesting, and
    // unbalanced ones (crow's-foot) would be painted as bracket errors.
    colorizedBracketPairs: [],
    autoClosingPairs: [
      { open: "{", close: "}", notIn: ["string", "comment"] },
      // Crow's-foot heads end in a brace that must stay unpaired: `||--o{`, `}|..|{`.
      // Monaco picks the longest matching opener, so these win over the plain `{`.
      ...["-o{", ".o{", "-|{", ".|{", "-{", ".{"].map((open) => ({ open, close: "" })),
      { open: "[", close: "]", notIn: ["comment"] },
      { open: "(", close: ")", notIn: ["comment"] },
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "<<", close: ">>", notIn: ["string", "comment"] },
      { open: "/'", close: " '/", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "<", close: ">" },
      { open: "*", close: "*" },
      { open: "_", close: "_" },
    ],
    // `$variable`, `%builtin`, `!directive` and `@startuml` are single words.
    wordPattern: /-?\d+(?:\.\d+)?[\w%]*|[!$%@]?[^\s`~!@#$%^&*()\-=+[\]{}\\|;:'",.<>/?]+/,
    indentationRules: { increaseIndentPattern, decreaseIndentPattern },
    onEnterRules: [
      // `else`, `case`, `fork again`: the next line goes back in
      {
        beforeText: new RegExp(`^\\s*(?:${OPEN_WORDS.join("|")})`),
        action: { indentAction: IndentAction.Indent },
      },
      { beforeText: new RegExp(`^${OPEN_SALT}`), action: { indentAction: IndentAction.Indent } },
    ],
  };
}

export const indentationPatterns = { increaseIndentPattern, decreaseIndentPattern };
