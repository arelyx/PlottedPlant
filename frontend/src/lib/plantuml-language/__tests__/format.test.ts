import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { applyEdits, closerIndentEdit, formatEdits, formatText, type FormatOptions } from "../core/format";

const corpusDir = path.join(__dirname, "corpus");
const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml"));
const read = (file: string) => fs.readFileSync(path.join(corpusDir, file), "utf8");

const spaces2: FormatOptions = { tabSize: 2, insertSpaces: true };
const spaces4: FormatOptions = { tabSize: 4, insertSpaces: true };
const tabs: FormatOptions = { tabSize: 4, insertSpaces: false };
const format = (source: string, options = spaces2) => formatText(source, options);
const uml = (body: string, options = spaces2) => format(`@startuml\n${body}\n@enduml`, options).split("\n").slice(1, -1).join("\n");
const nonWhitespace = (text: string) => text.replace(/\s+/g, "");

describe("formatting the corpus", () => {
  // The oracle script (scripts described in the track report) checks that these outputs still
  // render identically; here the two properties that need no engine are checked on every run.
  describe.each([
    ["2 spaces", spaces2],
    ["4 spaces", spaces4],
    ["tabs", tabs],
  ])("%s", (_name, options) => {
    it.each(files)("%s: idempotent, and only whitespace changes", (file) => {
      const source = read(file);
      const once = format(source, options);
      expect(format(once, options)).toBe(once);
      expect(nonWhitespace(once)).toBe(nonWhitespace(source));
    });
  });

  it.each(files)("%s: same after losing all indentation, when indentation is not syntax", (file) => {
    const flat = read(file)
      .split("\n")
      .map((line) => line.replace(/^[ \t]+/, ""))
      .join("\n");
    const once = format(flat);
    expect(format(once)).toBe(once);
    expect(nonWhitespace(once)).toBe(nonWhitespace(flat));
  });

  it("re-indents the templates' nesting the way they were written", () => {
    // The seeded templates are hand-indented with two spaces; formatting must not fight that.
    for (const file of files.filter((f) => f.startsWith("authoring-sequence") || f === "authoring-activity-nested.puml")) {
      expect(format(read(file)), file).toBe(read(file));
    }
  });
});

describe("indentation", () => {
  it("indents by nesting depth with the editor's unit", () => {
    const body = "alt a\nA -> B\nloop\nB -> A\nend\nelse b\nA -> A\nend";
    expect(uml(body)).toBe("alt a\n  A -> B\n  loop\n    B -> A\n  end\nelse b\n  A -> A\nend");
    expect(uml(body, spaces4)).toBe("alt a\n    A -> B\n    loop\n        B -> A\n    end\nelse b\n    A -> A\nend");
    expect(uml(body, tabs)).toBe("alt a\n\tA -> B\n\tloop\n\t\tB -> A\n\tend\nelse b\n\tA -> A\nend");
  });

  it("removes stray indentation at the top level and converts tabs", () => {
    expect(uml("   A -> B\n\t\tB -> A")).toBe("A -> B\nB -> A");
    expect(format("  @startuml\n  A -> B\n  @enduml")).toBe("@startuml\nA -> B\n@enduml");
  });

  it("indents brace blocks, activity blocks and preprocessor blocks", () => {
    expect(uml("package P {\nnode N {\ncomponent C\n}\n}")).toBe("package P {\n  node N {\n    component C\n  }\n}");
    expect(uml("start\nif (a) then\n:x;\nelse\nwhile (b)\n:y;\nendwhile\nendif\nstop")).toBe(
      "start\nif (a) then\n  :x;\nelse\n  while (b)\n    :y;\n  endwhile\nendif\nstop",
    );
    expect(uml("!if (1)\nA -> B\n!else\nB -> A\n!endif")).toBe("!if (1)\n  A -> B\n!else\n  B -> A\n!endif");
  });

  it("indents style, skinparam, JSON and Salt by their brackets", () => {
    expect(uml("<style>\nnote {\nFontSize 10\n}\n</style>\nskinparam class {\nBackgroundColor red\n}")).toBe(
      "<style>\n  note {\n    FontSize 10\n  }\n</style>\nskinparam class {\n  BackgroundColor red\n}",
    );
    expect(format('@startjson\n{\n"a": [\n1,\n{"b": 2}\n],\n"c": "  keep   this  "\n}\n@endjson')).toBe(
      '@startjson\n{\n  "a": [\n    1,\n    {"b": 2}\n  ],\n  "c": "  keep   this  "\n}\n@endjson',
    );
    expect(format("@startsalt\n{\nName | \"x\"\n{\n[OK] | [Cancel]\n}\n}\n@endsalt")).toBe(
      "@startsalt\n{\n  Name | \"x\"\n  {\n    [OK] | [Cancel]\n  }\n}\n@endsalt",
    );
  });
});

describe("whitespace clean-up", () => {
  it("trims trailing whitespace on statements", () => {
    expect(uml("A -> B : hi   \nB -> A\t")).toBe("A -> B : hi\nB -> A");
  });

  it("does not trim when that would expose a trailing backslash", () => {
    expect(uml("A -> B : path C:\\dir\\ \nB -> A")).toBe("A -> B : path C:\\dir\\ \nB -> A");
  });

  it("collapses three or more blank lines to one and leaves shorter runs", () => {
    expect(uml("A -> B\n\n\n\nB -> A\n\n\nA -> A\n\nB -> B")).toBe("A -> B\n\nB -> A\n\n\nA -> A\n\nB -> B");
    expect(uml("A -> B\n  \n\t\n   \n \nB -> A")).toBe("A -> B\n\nB -> A");
  });

  it("collapses a run at the very end of a document without tags", () => {
    expect(format("alt x\nA -> B\nend\n\n\n\n")).toBe("alt x\n  A -> B\nend\n");
  });

  it("empties whitespace-only lines between statements", () => {
    expect(uml("A -> B\n   \nB -> A")).toBe("A -> B\n\nB -> A");
  });

  it("changes nothing inside lines: spacing, case and arrows stay", () => {
    expect(uml("A   ->    B :  two  spaces\nCLASS  x")).toBe("A   ->    B :  two  spaces\nCLASS  x");
  });
});

describe("text bodies move as a unit", () => {
  it("shifts a note body uniformly, keeping its relative indentation", () => {
    expect(uml("alt x\nnote left\n* a\n  ** b\n      deep\nend note\nend")).toBe(
      "alt x\n  note left\n    * a\n      ** b\n          deep\n  end note\nend",
    );
    expect(uml("      note left\n          a\n            b\n      end note")).toBe("note left\n  a\n    b\nend note");
  });

  it("keeps trailing whitespace and blank lines inside a body", () => {
    expect(uml("note left\nline one   \n\n\n\nline two\nend note")).toBe("note left\n  line one   \n\n\n\n  line two\nend note");
  });

  it("leaves a body alone when it holds a whitespace-only line", () => {
    // The engine counts such a line when it strips common columns, so its length matters.
    expect(uml("note left\na\n   \nb\nend note")).toBe("note left\na\n   \nb\nend note");
  });

  it("handles legend, title, header, footer, caption and ref bodies", () => {
    expect(uml("legend\nL\n L2\nend legend\ntitle\nT\nend title\nref over A\nR\nend ref")).toBe(
      "legend\n  L\n   L2\nend legend\ntitle\n  T\nend title\nref over A\n  R\nend ref",
    );
  });

  it("moves a multi-line activity label rigidly, first line included", () => {
    expect(uml("start\nif (x) then\n:first\n   second\n third;\nendif\nstop")).toBe(
      "start\nif (x) then\n  :first\n     second\n   third;\nendif\nstop",
    );
    // Body lines to the left of the label's first line limit how far it can move.
    expect(uml("start\n    :first\n  second;\nstop")).toBe("start\n  :first\nsecond;\nstop");
  });

  it("shifts class members as a block instead of flattening them", () => {
    expect(uml("class A {\n+f()\n|_ tree\n  |_ nested\n}")).toBe("class A {\n  +f()\n  |_ tree\n    |_ nested\n}");
  });

  it("shifts bracketed descriptions with their closing line when it carries text", () => {
    expect(uml("node N {\ncomponent c [\nTitle\n  sub\n]\nrectangle r [first\n  last]\n}")).toBe(
      "node N {\n  component c [\n    Title\n      sub\n  ]\n  rectangle r [first\n    last]\n}",
    );
  });
});

describe("what the formatter never touches", () => {
  const untouched = (source: string) => expect(format(source)).toBe(source);

  it("block comments", () => {
    expect(uml("alt x\n      /' keep\n   this\n            as is '/\nend")).toBe("alt x\n      /' keep\n   this\n            as is '/\nend");
  });

  it("lines continued with a backslash", () => {
    expect(uml("alt x\nA -> B : one \\\n          two \\\n     three\nend")).toBe("alt x\n  A -> B : one \\\n          two \\\n     three\nend");
  });

  it("mindmap, WBS, Gantt, YAML, ditaa, dot and other unparsed dialects", () => {
    untouched("@startmindmap\n* root   \n   ** a\n\n\n\n\t*** b\n@endmindmap");
    untouched("@startwbs\n* root\n ** a\n  *** b\n@endwbs");
    untouched("@startgantt\n   [A] lasts 5 days   \n[B] lasts 2 days\n@endgantt");
    untouched("@startyaml\na:\n  b: 1\n  c:\n    - x   \n@endyaml");
    untouched("@startditaa\n+----+   +----+\n| a  |-->| b  |\n+----+   +----+\n@endditaa");
    untouched("@startuml\ndigraph G {\n      a -> b\n}\n@enduml");
    untouched("@startebnf\n  rule = a,\n      b;\n@endebnf");
  });

  it("Salt tree rows", () => {
    expect(format("@startsalt\n{\n{T\n + a\n ++ b\n}\n}\n@endsalt")).toBe("@startsalt\n{\n  {T\n + a\n ++ b\n  }\n}\n@endsalt");
  });

  it("procedure, function and definelong bodies, which are text templates", () => {
    expect(uml("package P {\n!procedure $p()\n      class A {\n   x\n      }\n!endprocedure\n}")).toBe(
      "package P {\n  !procedure $p()\n      class A {\n   x\n      }\n  !endprocedure\n}",
    );
  });

  it("text bodies in a diagram that defines multi-line macros", () => {
    // A macro called inside the note expands to lines with the macro's indentation, not the note's.
    expect(uml("!definelong M()\nx\n!enddefinelong\nalt y\nnote left\nM()\nend note\nend")).toBe(
      "!definelong M()\nx\n!enddefinelong\nalt y\n  note left\nM()\n  end note\nend",
    );
  });

  it("anything outside the diagram blocks", () => {
    untouched("   notes to self   \n\n\n\n@startuml\nA -> B\n@enduml\n   trailing words   ");
  });

  it("a block that is unclosed or unbalanced", () => {
    untouched("@startuml\n   alt x\n A -> B   \n@enduml");
    untouched("@startuml\n   A -> B   \n }\n@enduml");
    untouched("@startuml\n   A -> B   \n");
    untouched("@startuml\n   A -> B\n  note left\n unfinished\n@enduml");
  });

  it("a block whose structure depends on the preprocessor", () => {
    untouched("@startuml\n!if (1)\n   package A {\n!endif\n class B\n }\n@enduml");
  });

  it("but still formats the well-formed blocks next to a broken one", () => {
    expect(format("@startuml\n   alt x\n@enduml\n@startuml\n   A -> B\n@enduml")).toBe("@startuml\n   alt x\n@enduml\n@startuml\nA -> B\n@enduml");
  });
});

describe("range formatting", () => {
  const lines = "@startuml\nalt x\nA -> B\nloop\nB -> A\nend\nend\n@enduml".split("\n");

  it("only edits lines in the range", () => {
    const edits = formatEdits(lines, spaces2, { startLine: 3, endLine: 5 });
    expect(applyEdits(lines, edits).join("\n")).toBe("@startuml\nalt x\nA -> B\n  loop\n    B -> A\n  end\nend\n@enduml");
  });

  it("moves a text body only when the range covers all of it", () => {
    const source = "@startuml\nnote left\na\n  b\nend note\n@enduml".split("\n");
    expect(applyEdits(source, formatEdits(source, spaces2, { startLine: 2, endLine: 2 })).join("\n")).toBe(source.join("\n"));
    expect(applyEdits(source, formatEdits(source, spaces2, { startLine: 2, endLine: 3 })).join("\n")).toBe(
      "@startuml\nnote left\n  a\n    b\nend note\n@enduml",
    );
  });

  it("produces edits that touch whitespace only", () => {
    for (const file of files) {
      const source = read(file).split("\n");
      for (const edit of formatEdits(source, spaces4)) {
        expect(edit.text, file).toMatch(/^[ \t]*$/);
        const { startLine, startColumn, endLine, endColumn } = edit.range;
        const removed =
          startLine === endLine
            ? source[startLine].slice(startColumn, endColumn)
            : [source[startLine].slice(startColumn), ...source.slice(startLine + 1, endLine), source[endLine].slice(0, endColumn)].join("");
        expect(removed, file).toMatch(/^[ \t]*$/);
      }
    }
  });
});

describe("on-type closer indentation", () => {
  const snap = (source: string, line: number) => {
    const lines = source.split("\n");
    const edit = closerIndentEdit(lines, line);
    return edit ? applyEdits(lines, [edit])[line] : null;
  };

  it("snaps a closer to its opener's indentation", () => {
    expect(snap("@startuml\n  alt x\n    A -> B\n    end\n@enduml", 3)).toBe("  end");
    expect(snap("@startuml\nstart\n\tif (x) then\n\t\t:a;\n\t\tendif\n@enduml", 4)).toBe("\tendif");
    expect(snap("@startuml\npackage P {\n  class A\n  }\n@enduml", 3)).toBe("}");
    expect(snap("@startuml\n  note left\n    text\n    end note\n@enduml", 3)).toBe("  end note");
  });

  it("snaps branch keywords too", () => {
    expect(snap("@startuml\n  alt x\n    A -> B\n    else\n  end\n@enduml", 3)).toBe("  else");
    expect(snap("@startuml\n!if (1)\n  A -> B\n  !else\n!endif\n@enduml", 3)).toBe("!else");
  });

  it("does nothing for a line that closes nothing, or is already in place", () => {
    expect(snap("@startuml\nalt x\n  A -> B\nend\n@enduml", 3)).toBeNull();
    expect(snap("@startuml\nalt x\n  A -> B\n@enduml", 2)).toBeNull();
    expect(snap("@startuml\n  end\n@enduml", 1)).toBeNull();
    expect(snap("@startmindmap\n* a\n  ** b\n@endmindmap", 2)).toBeNull();
  });

  it("works while the rest of the diagram is still unbalanced", () => {
    expect(snap("@startuml\nalt x\n  loop\n    A -> B\n    end\n@enduml", 4)).toBe("  end");
  });
});
