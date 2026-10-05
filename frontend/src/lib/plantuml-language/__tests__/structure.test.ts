import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyzeStructure, type DocumentStructure } from "../core/structure";

const corpusDir = path.join(__dirname, "corpus");
const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml"));

const analyze = (source: string) => analyzeStructure(source.split("\n"));
const uml = (body: string) => analyze(`@startuml\n${body}\n@enduml`);

/** `kind keyword open-close` (1-based lines) for each construct, in document order. */
const outline = (doc: DocumentStructure) =>
  doc.constructs.map(
    (c) => `${c.kind} ${c.keyword} ${c.openLine + 1}-${c.closeLine + 1}${c.midLines.length ? ` mid ${c.midLines.map((l) => l + 1).join(",")}` : ""}`,
  );
const issues = (doc: DocumentStructure) => doc.issues.map((i) => `${i.kind} ${i.keyword} @${i.line + 1}`);
const depths = (doc: DocumentStructure) => doc.lines.map((l) => (l.role === "code" || l.role === "tag" ? l.depth : l.role));

describe("structure over the corpus", () => {
  // Every corpus file is accepted by the real engine, so every construct in it must pair up.
  it.each(files)("%s is balanced", (file) => {
    const doc = analyze(fs.readFileSync(path.join(corpusDir, file), "utf8").replace(/\r\n/g, "\n"));
    expect(issues(doc)).toEqual([]);
    expect(doc.strayEndLines).toEqual([]);
    for (const block of doc.blocks) {
      expect(block.balanced || block.uncertain, `block at line ${block.startLine + 1}`).toBe(true);
      expect(block.closedBy === "end" || block.implicit, `block at line ${block.startLine + 1} is closed`).toBe(true);
    }
    for (const construct of doc.constructs) {
      if (doc.blocks[construct.block].uncertain) continue;
      expect(construct.closeLine, `${construct.keyword} at line ${construct.openLine + 1}`).toBeGreaterThanOrEqual(construct.openLine);
    }
  });
});

describe("blocks", () => {
  it("records how each block ended", () => {
    const doc = analyze("@startuml\nA -> B\n@startmindmap\n* a\n@enduml\n\n@startjson\n{}\n");
    expect(doc.blocks.map((b) => [b.tag, b.startLine, b.endLine, b.closedBy, b.endTag])).toEqual([
      ["uml", 0, 1, "start", null],
      ["mindmap", 2, 4, "end", "uml"],
      ["json", 6, 8, "eof", null],
    ]);
  });

  it("matches tags case-sensitively, as the engine does", () => {
    const doc = analyze("@startuml\nconcise \"Ender\" as Ender\n@Ender\n0 is idle\n@enduml");
    expect(doc.blocks.map((b) => [b.startLine, b.endLine])).toEqual([[0, 4]]);
    expect(doc.strayEndLines).toEqual([]);
  });

  it("collects @end lines that close nothing", () => {
    expect(analyze("@enduml\n@startuml\n@enduml\n@enduml").strayEndLines).toEqual([0, 3]);
  });

  it("treats a document without tags as one implicit UML block", () => {
    const doc = analyze("alt x\n  A -> B\nend");
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({ implicit: true, dialect: "uml", balanced: true });
    expect(outline(doc)).toEqual(["seq-group alt 1-3"]);
  });

  it("picks the dialect from the tag, or from the first statement of @startuml", () => {
    const dialect = (source: string) => analyze(source).blocks[0].dialect;
    expect(dialect("@startmindmap\n* a\n@endmindmap")).toBe("tree");
    expect(dialect("@startwbs\n* a\n@endwbs")).toBe("tree");
    expect(dialect("@startgantt\n[a] lasts 1 day\n@endgantt")).toBe("lines");
    expect(dialect("@startyaml\na: 1\n@endyaml")).toBe("opaque");
    expect(dialect("@startditaa\n+--+\n@endditaa")).toBe("opaque");
    expect(dialect("@startjson\n{}\n@endjson")).toBe("json");
    expect(dialect("@startsalt\n{\n}\n@endsalt")).toBe("salt");
    expect(dialect("@startuml\n' c\nsalt\n{\n}\n@enduml")).toBe("salt");
    expect(dialect("@startuml\nditaa\n+--+\n@enduml")).toBe("opaque");
    expect(dialect("@startuml\ndigraph G {\n a -> b\n}\n@enduml")).toBe("opaque");
    expect(dialect("@startnwdiag\nnwdiag {\n}\n@endnwdiag")).toBe("braces");
  });
});

describe("sequence constructs", () => {
  it("pairs groups with end, with else and also as branches", () => {
    const doc = uml("alt a\nA -> B\nelse b\nB -> A\nelse\nA -> A\nend\npar\nA -> B\nalso\nB -> A\nend");
    expect(outline(doc)).toEqual(["seq-group alt 2-8 mid 4,6", "seq-group par 9-13 mid 11"]);
    expect(depths(doc)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]);
  });

  it("knows every grouping keyword, colours and `end <word>`", () => {
    const doc = uml(
      "opt\nend\nloop 3 times\nend loop\npar2\nend\nbreak\nend\ncritical x\nend\ngroup My label [second]\nend group\npartition P\nend\nalt #LightBlue ok\nelse #Pink bad\nend",
    );
    expect(doc.constructs.map((c) => c.keyword)).toEqual(["opt", "loop", "par2", "break", "critical", "group", "partition", "alt"]);
    expect(issues(doc)).toEqual([]);
  });

  it("pairs box with end box", () => {
    expect(outline(uml('box "Internal" #LightBlue\nparticipant A\nend box\nbox\nparticipant B\nendbox'))).toEqual([
      "box box 2-4",
      "box box 5-7",
    ]);
  });

  it("treats a note without a label as multi-line and one with a label as complete", () => {
    const doc = uml(
      "A -> B\nnote left\nx\nend note\nnote left: one line\nnote over A, B #FFAAAA\nx\nendnote\nnote over A : one\nhnote across\nx\nendhnote\n/ rnote right of B\nx\nend rnote\nnote right of A #red: text\nnote left of A::b\nx\nend note",
    );
    expect(outline(doc)).toEqual(["note note 3-5", "note note 7-9", "note hnote 11-13", "note rnote 14-16", "note note 18-20"]);
  });

  it("does not let colons inside colour specs, links, strings or stereotypes end a note header", () => {
    const doc = uml(
      'class A\nA --> B\nnote right on link #blue;line:yellow;text:purple\nx\nend note\nnote left of A [[http://example.com]]\nx\nend note\nnote left of A <<a:b>>\nx\nend note\nnote "a: b" as N',
    );
    expect(doc.constructs.map((c) => `${c.kind} ${c.openLine + 1}-${c.closeLine + 1}`)).toEqual(["note 4-6", "note 7-9", "note 10-12"]);
  });

  it("does not parse note content", () => {
    const doc = uml("A -> B\nnote left\nend\nalt\nelse\n}\nstart\nend note\nalt x\nend");
    expect(outline(doc)).toEqual(["note note 3-9", "seq-group alt 10-11"]);
    expect(doc.blocks[0].family).toBe("general");
  });

  it("pairs ref over with end ref and leaves the one-line form alone", () => {
    expect(outline(uml("ref over A, B\ninit\nend ref\nref over A : one line\nref over A\nx\nend"))).toEqual([
      "text ref 2-4",
      "text ref 6-8",
    ]);
  });

  it("reads a multi-line participant description up to its closing bracket", () => {
    expect(outline(uml("participant P [\n=Title\n----\nsub\n]\nP -> P"))).toEqual(["text participant 2-6"]);
  });

  it("does not take element names that look like keywords for groups", () => {
    const doc = uml('class Group\nGroup "1" o-- "*" Activity : has >\nloop --> Group\nopt : field\nbreak <|-- alt\nend -- Group');
    expect(outline(doc)).toEqual([]);
    expect(issues(doc)).toEqual([]);
  });

  it("switches to the structural family when a class-like statement follows a keyword-like name", () => {
    const doc = uml("group x\nclass A {\n  f\n}\nA --> group");
    expect(doc.blocks[0].family).toBe("structural");
    expect(issues(doc)).toEqual([]);
  });
});

describe("activity constructs", () => {
  it("pairs every block form of the new syntax", () => {
    const doc = uml(
      [
        "start",
        "if (a) then (y)",
        ":x;",
        "elseif (b) then (y)",
        ":y;",
        "else (n)",
        ":z;",
        "endif",
        "switch (s)",
        "case (1)",
        ":a;",
        "case (2)",
        ":b;",
        "endswitch",
        "while (w) is (yes)",
        ":c;",
        "endwhile (no)",
        "repeat",
        ":d;",
        "repeat while (r)",
        "fork",
        ":e;",
        "fork again",
        ":f;",
        "end merge",
        "split",
        ":g;",
        "split again",
        ":h;",
        "end split",
        "partition P {",
        ":i;",
        "}",
        "group G",
        ":j;",
        "end group",
        "stop",
      ].join("\n"),
    );
    expect(outline(doc)).toEqual([
      "if if 3-9 mid 5,7",
      "switch switch 10-15 mid 11,13",
      "while while 16-18",
      "repeat repeat 19-21",
      "fork fork 22-26 mid 24",
      "split split 27-31 mid 29",
      "brace partition 32-34",
      "group group 35-37",
    ]);
    expect(doc.blocks[0].family).toBe("activity");
  });

  it("accepts the alternative closer spellings", () => {
    const doc = uml("start\nif (a) then\nend if\nwhile (x)\nend while\nfork\nendfork\nfork\nfork end\nsplit\nsplit end\ngroup g\nendgroup\nrepeat :a;\nrepeatwhile (x)\nstop");
    expect(issues(doc)).toEqual([]);
    expect(doc.constructs.every((c) => c.closeLine > c.openLine)).toBe(true);
  });

  it("treats end and break as statements, not closers", () => {
    const doc = uml("start\nwhile (x)\n  if (y) then\n    break\n  endif\nendwhile\nend");
    expect(issues(doc)).toEqual([]);
    expect(outline(doc)).toEqual(["while while 3-7", "if if 4-6"]);
  });

  it("keeps a multi-line label together with the lines it spans", () => {
    const doc = uml("start\n:one line;\n:first\n  if (not a keyword) then\nlast;\n#palegreen:coloured;\n-> arrow\nlabel;\n:tagged; <<input>>\nstop");
    expect(outline(doc)).toEqual(["label : 4-6", "label -> 8-9"]);
    expect(doc.lines.slice(3, 6).map((l) => [l.role, l.group])).toEqual([
      ["text", 0],
      ["text", 0],
      ["text", 0],
    ]);
  });

  it("does not mistake coloured keywords and connectors for labels", () => {
    const doc = uml("start\n#palegreen:if (a) then\n(A)\n#blue:(B)\nendif\n#red:while (x)\nendwhile\nstop");
    expect(outline(doc)).toEqual(["if if 3-6", "while while 7-8"]);
  });

  it("is unsure about labels ended the old way, which engines disagree on", () => {
    const doc = uml("start\n:old style|\n:a\nb]\nstop");
    expect(doc.blocks[0]).toMatchObject({ uncertain: true, balanced: false });
    expect(doc.issues).toEqual([]);
  });

  it("pairs legacy if/else/endif and partitions", () => {
    const doc = uml('(*) --> "a"\nif "t" then\n-->[y] "b"\nelse\n--> if "u" then\n--> "c"\nendif\nendif\npartition P {\n"b" --> "d"\n}\npartition Q\n"d" --> (*)\nend partition');
    expect(doc.blocks[0].family).toBe("legacy-activity");
    expect(outline(doc)).toEqual(["if if 3-9 mid 5", "if if 6-8", "brace partition 10-12", "partition partition 13-15"]);
  });

  it("keeps a legacy multi-line activity name together", () => {
    const doc = uml('(*) --> "first\n  second\nthird"\n--> (*)');
    expect(outline(doc)).toEqual(['text " 2-4']);
  });
});

describe("brace and body constructs", () => {
  it("nests containers and treats class bodies as member text", () => {
    const doc = uml("package P {\nnamespace n {\nclass A {\n+f()\n{static} g()\n}\n}\nstate S {\n}\nnode N {\n}\ntogether {\n}\n}");
    expect(outline(doc)).toEqual([
      "brace package 2-15",
      "brace namespace 3-8",
      "members class 4-7",
      "brace state 9-10",
      "brace node 11-12",
      "brace together 13-14",
    ]);
    expect(doc.lines[4].role).toBe("text");
  });

  it("does not open anything for one-line forms", () => {
    const doc = uml('class A\nstate B : description\ntitle My title\nlegend right: x\nheader h\nfooter f\ncaption c\nnote left of A: text\nnote "x" as N\nA --> B : uses {id}\nrectangle "a { b" as R\nA -> B : call({');
    expect(outline(doc)).toEqual([]);
    expect(issues(doc)).toEqual([]);
  });

  it("pairs the multi-line forms of title, legend, header, footer and caption", () => {
    const doc = uml("title\nt\nend title\nlegend top left\nl\nendlegend\ncenter header\nh\nendheader\nright footer\nf\nend footer\ncaption\nc\nend caption\nA -> B");
    expect(doc.constructs.map((c) => `${c.keyword} ${c.openLine + 1}-${c.closeLine + 1}`)).toEqual([
      "title 2-4",
      "legend 5-7",
      "header 8-10",
      "footer 11-13",
      "caption 14-16",
    ]);
  });

  it("tracks style, skinparam, json and map bodies", () => {
    const doc = uml('<style>\nnote {\nFontSize 10\n}\n</style>\nskinparam class {\nBackgroundColor red\nArrow {\nColor blue\n}\n}\njson J {\n"a": {\n"b": [1, 2]\n}\n}\nmap M {\na => 1\n}\nskinparam shadowing false');
    expect(outline(doc)).toEqual(["style <style> 2-6", "skinparam skinparam 7-12", "json json 13-17", "members map 18-20"]);
    expect(depths(doc).slice(1, 17)).toEqual([0, 1, 2, 1, 0, 0, 1, 1, 2, 1, 0, 0, 1, 2, 1, 0]);
  });

  it("reads bracketed and quoted multi-line descriptions", () => {
    const doc = uml('component c [\nline\n  indented\n]\nrectangle r [first\nlast]\nusecase u as "one\ntwo"\ncomponent [Inline] as i\nartifact a [[http://x]]');
    expect(outline(doc)).toEqual(["text component 2-5", "text rectangle 6-7", "text usecase 8-9"]);
  });

  it("pairs state begin with end state", () => {
    expect(outline(uml("state A begin\nB --> C\nend state"))).toEqual(["state state 2-4"]);
  });

  it("tracks block comments, which only start at the beginning of a line", () => {
    const doc = uml("/' one line '/\nA -> B /' inline '/\n/'\nalt\n'/\nA -> B : path/'x");
    expect(outline(doc)).toEqual(["comment /' 4-6"]);
    expect(doc.lines.slice(3, 6).map((l) => l.role)).toEqual(["verbatim", "verbatim", "verbatim"]);
  });

  it("keeps the lines after a trailing backslash verbatim and reads the joined line", () => {
    const doc = uml("package P \\\n   {\nclass A\n}");
    expect(outline(doc)).toEqual(["brace package 2-5"]);
    expect(doc.lines[2].role).toBe("verbatim");
  });

  it("counts brackets in Salt and JSON, leaving Salt tree rows alone", () => {
    const salt = analyze("@startsalt\n{\n{T\n+ a\n++ b\n}\n[OK] | { x | y }\n}\n@endsalt");
    expect(depths(salt)).toEqual([0, 0, 1, "verbatim", "verbatim", 1, 1, 0, 0]);
    const json = analyze('@startjson\n{\n"a": [\n1,\n{"b": "}{]["}\n],\n"c": {}\n}\n@endjson');
    expect(depths(json)).toEqual([0, 0, 1, 2, 2, 1, 1, 0, 0]);
    expect(json.blocks[0].balanced).toBe(true);
  });

  it("leaves indentation-significant dialects verbatim", () => {
    for (const source of ["@startmindmap\n* a\n ** b\n@endmindmap", "@startyaml\na:\n  b: 1\n@endyaml", "@startgantt\n[a] lasts 1 day\n@endgantt"]) {
      const doc = analyze(source);
      expect(doc.lines.slice(1, -1).every((l) => l.role === "verbatim")).toBe(true);
    }
  });
});

describe("preprocessor constructs", () => {
  it("pairs every directive block", () => {
    const doc = uml(
      "!if (1)\n!elseif (2)\n!else\n!endif\n!ifdef X\n!endif\n!ifndef X\n!endif\n!procedure $p()\n!endprocedure\n!function $f()\n!return 1\n!endfunction\n!unquoted procedure q()\n!end procedure\n!definelong D\n!enddefinelong\n!foreach $i in [1]\n!endfor\n!while 0\n!endwhile\n!startsub S\n!endsub\n!function $one($x) !return $x",
    );
    expect(outline(doc)).toEqual([
      "pp-if !if 2-5 mid 3,4",
      "pp-if !ifdef 6-7",
      "pp-if !ifndef 8-9",
      "pp-def !procedure 10-11",
      "pp-def !function 12-14",
      "pp-def !procedure 15-16",
      "pp-def !definelong 17-18",
      "pp-loop !foreach 19-20",
      "pp-loop !while 21-22",
      "pp-sub !startsub 23-24",
    ]);
  });

  it("indents by both diagram and preprocessor nesting", () => {
    const doc = uml("alt x\n!if (1)\nA -> B\n!else\nB -> A\n!endif\nend");
    expect(depths(doc)).toEqual([0, 0, 1, 2, 1, 2, 1, 0, 0]);
  });

  it("keeps definition bodies verbatim: they are text templates", () => {
    const doc = uml("!procedure $p()\n  class A {\n    x\n  }\n!endprocedure");
    expect(doc.lines.slice(1, 6).map((l) => l.role)).toEqual(["code", "verbatim", "verbatim", "verbatim", "code"]);
  });

  it("accepts branches that each open or close the same thing", () => {
    const doc = uml("!if (1)\npackage A {\n!else\npackage B {\n!endif\nclass C\n}");
    expect(doc.blocks[0]).toMatchObject({ balanced: true, uncertain: false });
  });

  it("gives up when branches disagree or a macro opens a construct", () => {
    expect(uml("!if (1)\npackage A {\n!endif\nclass C\n}").blocks[0]).toMatchObject({ uncertain: true });
    const macro = uml("!definelong TABLE(name)\nentity name {\n!enddefinelong\nTABLE(house)\n  id\n}");
    expect(macro.blocks[0].uncertain).toBe(true);
    expect(macro.issues).toEqual([]);
  });

  it("reads a JSON variable spread over several lines", () => {
    const doc = uml('!$data = {\n"a": [\n1\n]\n}\n!$one = {"a": 1}\nA -> B');
    expect(outline(doc)).toEqual(["json !$data 2-6"]);
    expect(issues(doc)).toEqual([]);
  });

  it("stays quiet about blocks that include outside files", () => {
    const doc = uml("!include other.iuml\n}\nend");
    expect(doc.blocks[0].external).toBe(true);
    expect(doc.issues).toEqual([]);
    expect(uml("!include <C4/C4_Container>\n}").issues).toHaveLength(1);
  });
});

describe("structure issues", () => {
  it("reports what was left open, innermost first, and where its closer belongs", () => {
    const doc = uml("alt x\nloop\nA -> B");
    expect(doc.issues.map((i) => [i.kind, i.keyword, i.line, i.expected, i.insertBefore])).toEqual([
      ["unclosed", "loop", 2, "end", 4],
      ["unclosed", "alt", 1, "end", 4],
    ]);
    expect(doc.blocks[0].balanced).toBe(false);
  });

  it("blames the inner construct when a closer reaches past it", () => {
    const doc = uml("start\npartition P {\nif (x) then\n:a;\n}\nstop");
    expect(doc.issues.map((i) => [i.kind, i.keyword, i.line, i.insertBefore])).toEqual([["unclosed", "if", 3, 5]]);
  });

  it("reports closers and branches with nothing to attach to", () => {
    expect(issues(uml("A -> B\nend\nelse\n}"))).toEqual(["stray-closer end @3", "stray-branch else @4", "stray-closer } @5"]);
    expect(issues(uml("start\nendif\nelse\nendwhile\nfork again\ncase (x)\nend note\nstop"))).toEqual([
      "stray-closer endif @3",
      "stray-branch else @4",
      "stray-closer endwhile @5",
      "stray-branch fork again @6",
      "stray-branch case @7",
      "stray-closer end note @8",
    ]);
    expect(issues(uml("!endif\n!else\n!endprocedure"))).toEqual([
      "stray-closer !endif @2",
      "stray-branch !else @3",
      "stray-closer !endprocedure @4",
    ]);
  });

  it("reports unclosed text bodies, comments and directive blocks", () => {
    expect(issues(uml("A -> B\nnote left\ntext"))).toEqual(["unclosed note @3"]);
    expect(issues(uml("/' open\ntext"))).toEqual(["unclosed /' @2"]);
    expect(issues(uml("!if (1)\nA -> B"))).toEqual(["unclosed !if @2"]);
    expect(issues(uml("<style>\nnote {\n}"))).toEqual(["unclosed <style> @2"]);
    expect(issues(analyze('@startjson\n{\n"a": [1\n}\n@endjson'))).not.toEqual([]);
  });
});
