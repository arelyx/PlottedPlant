import { StreamLanguage, type StringStream } from "@codemirror/language";
import { vocab } from "./plantuml-language/vocab";

/**
 * PlantUML syntax highlighting for CodeMirror 6, used by the read-only version
 * diff and preview dialogs. A deliberately small stream tokenizer: the full
 * grammar is the Monarch one in plantuml-language/monaco. Word lists come from
 * the same PlantUML vocabulary.
 */
interface State {
  /** Inside a multi-line block comment. */
  blockComment: boolean;
  /** After the `:` of a message or label: the rest of the line is prose. */
  text: boolean;
}

const TYPES = new Set(vocab.types);
const KEYWORDS = new Set(vocab.keywords.filter((word) => !word.includes(" ") && !TYPES.has(word)));
const TAGS = new RegExp(`^@(?:start|end)(?:${vocab.startTags.join("|")})\\b`);

const ARROW =
  /^(?:<\|?|[*#+^]|[ox](?=[-.])|\}[o|]?|\|[o|])?(?:-+|\.{2,}|={2,}|~{2,})(?:\[[^\]]*\][-.=~]*)?(?:\|?>>?|[o|]\{|\|\||[*#+^]|[ox](?!\w))?/;

function blockComment(stream: StringStream, state: State): string {
  if (stream.skipTo("'/")) {
    stream.match("'/");
    state.blockComment = false;
  } else {
    stream.skipToEnd();
    state.blockComment = true;
  }
  return "comment";
}

const plantumlStreamParser = {
  startState: (): State => ({ blockComment: false, text: false }),

  token(stream: StringStream, state: State): string | null {
    if (stream.sol()) state.text = false;
    if (state.blockComment) return blockComment(stream, state);

    const lineStart = stream.string.slice(0, stream.pos).trim() === "";
    if (stream.eatSpace()) return null;

    if (stream.match("/'")) return blockComment(stream, state);
    // A quote only starts a comment at the beginning of a line ("it's" is text).
    if (lineStart && stream.peek() === "'") {
      stream.skipToEnd();
      return "comment";
    }
    if (lineStart && stream.match(TAGS)) return "keyword";
    if (lineStart && stream.match(/^!\w*/)) return "meta";

    if (state.text) {
      stream.match(/^[^\s]+/);
      return null;
    }

    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^#\w+/)) return "number";
    if (stream.match(/^\$\w+|^%\w+(?=\()/)) return "meta";

    // Arrows: -->, <|--, ..>, -[#red]->, o--, *--, }o--||
    if (stream.match(ARROW)) return "operator";

    if (stream.match(/^::/)) return null;
    if (stream.match(":")) {
      state.text = true;
      return null;
    }

    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (TYPES.has(word)) return "typeName";
      if (KEYWORDS.has(word)) return "keyword";
      return null;
    }

    stream.next();
    return null;
  },
};

export const plantumlLanguage = StreamLanguage.define(plantumlStreamParser);
