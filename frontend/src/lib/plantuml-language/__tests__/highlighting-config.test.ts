import { describe, expect, it } from "vitest";
import { indentationPatterns, languageConfiguration } from "../monaco/language-config";

const { increaseIndentPattern: opens, decreaseIndentPattern: closes } = indentationPatterns;

// languageConfiguration only reads the IndentAction enum from Monaco.
const config = languageConfiguration({ languages: { IndentAction: { None: 0, Indent: 1, IndentOutdent: 2, Outdent: 3 } } } as never);

describe("indentation rules", () => {
  it.each([
    "alt success",
    "else failure",
    "loop 3 times",
    "opt",
    "par",
    "group My label",
    "critical",
    'box "Internal" #LightBlue',
    "if (ok?) then (yes)",
    "elseif (x) then (y)",
    "else (no)",
    "while (more?) is (yes)",
    "repeat",
    "fork",
    "fork again",
    "split again",
    "switch (x)",
    "case (a)",
    'partition "Name" {',
    "class Foo {",
    "  state Inner {",
    'package "P" <<Frame>> {',
    "skinparam class {",
    "note left of A",
    "note right of Foo::bar",
    "note as N",
    "hnote over A",
    "ref over A, B",
    "title",
    "legend right",
    "center footer",
    "<style>",
    "!if ($x == 1)",
    "!procedure $p($a)",
    "!unquoted function f(a)",
    "!foreach $i in [1, 2]",
    "rectangle R [",
    "{+",
    '{^"Group"',
  ])("indents after %s", (text) => {
    expect(opens.test(text)).toBe(true);
  });

  it.each([
    "Alice -> Bob : hi",
    "note left of A: single line",
    'note "floating" as N1',
    "ref over A, B : inline",
    "title My diagram",
    "class Foo",
    "class Foo {}",
    "repeat while (again?)",
    "A ||--o{ B : has",
    "loop -> end : participants named like keywords",
    "else : also a participant",
    "!function $f($a) !return $a",
    "!$x = 1",
    "stop",
    "[*] --> Active",
  ])("does not indent after %s", (text) => {
    expect(opens.test(text)).toBe(false);
  });

  it.each([
    "end",
    "end note",
    "endnote",
    "end box",
    "end fork",
    "endif",
    "endwhile (no)",
    "endswitch",
    "endlegend",
    "end title",
    "else",
    "elseif (x) then (y)",
    "case (b)",
    "fork again",
    "repeat while (more?)",
    "}",
    "  }",
    "]",
    "!endif",
    "!else",
    "!endprocedure",
    "</style>",
  ])("outdents %s", (text) => {
    expect(closes.test(text)).toBe(true);
  });

  it.each(["Alice -> Bob", "endpoint -> x", "end -> start : named end", "A }o--|| B", "note left", "!$end = 1"])(
    "does not outdent %s",
    (text) => {
      expect(closes.test(text)).toBe(false);
    },
  );
});

describe("language configuration", () => {
  it("toggles comments with PlantUML's markers", () => {
    expect(config.comments).toEqual({ lineComment: "'", blockComment: ["/'", "'/"] });
  });

  it("does not rainbow-colour brackets, which PlantUML uses unbalanced", () => {
    expect(config.colorizedBracketPairs).toEqual([]);
  });

  it("treats sigil-prefixed names as one word", () => {
    const word = (text: string) => text.match(config.wordPattern!)?.[0];
    expect(word("$variable = 1")).toBe("$variable");
    expect(word("%strlen(x)")).toBe("%strlen");
    expect(word("!include <x>")).toBe("!include");
    expect(word("@startuml")).toBe("@startuml");
    expect(word("Alice->Bob")).toBe("Alice");
    expect(word("foo_bar.baz")).toBe("foo_bar");
    expect(word("Müller -> x")).toBe("Müller");
  });
});
