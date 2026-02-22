import { StreamLanguage, StringStream } from "@codemirror/language";

/**
 * PlantUML syntax highlighting for CodeMirror 6.
 * Mirrors the Monaco Monarch tokenizer used in DocumentPage.tsx.
 */
const plantumlStreamParser = {
  token(stream: StringStream): string | null {
    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Comments: ' single-line or /' block-start
    if (stream.match("/'")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("'")) {
      stream.skipToEnd();
      return "comment";
    }

    // Strings: "..."
    if (stream.match(/"[^"]*"/)) return "string";

    // Color literals: #AABBCC or #colorName
    if (stream.match(/#[a-fA-F0-9]{6}\b/)) return "number";
    if (stream.match(/#\w+/)) return "number";

    // Preprocessor directives: !include, !define, etc.
    if (stream.match(/![a-z]+/)) return "meta";

    // Arrows: -->, <--, ..>, <.., ~~>, etc.
    if (stream.match(/-+[>|*ox]+/) || stream.match(/<[>|*ox]?-+/)) return "operator";
    if (stream.match(/\.+[>|*ox]+/) || stream.match(/<[>|*ox]?\.+/)) return "operator";
    if (stream.match(/~+[>|*ox]+/)) return "operator";

    // @directives: @startuml, @enduml, etc.
    if (stream.match(/@(startuml|enduml|startmindmap|endmindmap|startsalt|endsalt|startgantt|endgantt|startjson|endjson|startyaml|endyaml)\b/)) {
      return "keyword";
    }

    // Words — check against keyword lists
    if (stream.match(/[a-zA-Z_]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      return null;
    }

    // Advance past any unmatched character
    stream.next();
    return null;
  },
};

const KEYWORDS = new Set([
  // Diagram elements
  "participant", "actor", "boundary", "control", "entity", "database", "collections", "queue",
  // Control flow
  "as", "order", "of", "on", "is", "if", "else", "elseif", "endif",
  "while", "endwhile", "repeat", "backward", "end", "fork", "again",
  "kill", "return", "stop", "start", "detach",
  // Annotations
  "note", "rnote", "hnote", "ref", "over", "legend", "header", "footer",
  "title", "caption", "newpage",
  // OOP / structure
  "class", "interface", "enum", "abstract", "annotation", "package",
  "namespace", "together", "set", "show", "hide", "remove", "skinparam",
  "style", "sprite",
  // Positioning
  "left", "right", "up", "down", "top", "bottom", "center",
  // Lifecycle
  "activate", "deactivate", "create", "destroy", "autonumber",
  // Containers
  "state", "partition", "rectangle", "node", "folder", "frame", "cloud",
  "component", "usecase", "artifact", "storage", "file", "card",
  "hexagon", "diamond", "circle", "label",
  // Grouping
  "group", "box", "loop", "alt", "opt", "break", "par", "critical", "section",
]);

export const plantumlLanguage = StreamLanguage.define(plantumlStreamParser);
