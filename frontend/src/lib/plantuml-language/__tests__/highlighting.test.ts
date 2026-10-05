import { describe, expect, it } from "vitest";
import { classOf, line, tokenize } from "./highlighting-harness";

/** Tokens of `source` as one readable string; `context` lines precede it. */
const t = (source: string, ...context: string[]) => line(source, context).join(" ");
const stackAfter = (source: string) => tokenize(source).at(-1)?.stack.join(">");

describe("arrows", () => {
  const whole = [
    ...["->", "-->", "->>", "-\\", "<->", "->x", "->o", "<|--", "*--", "o--", "..>", "--|>", "-up->", ".left.|>"],
    ...["}o--||", "||--o{", "}|..|{", "|o--o|", "--()", "-(0-", "..", "-", "~~>", "==>", "<<--", "o<-->o", "x<-"],
    ...["//--", "#--", "+--", "^--", "<-->", "-->>"],
  ];
  it.each(whole)("%s is a single arrow token", (arrow) => {
    expect(t(`A ${arrow} B`)).toBe(`A‹identifier› ${arrow}‹operator.arrow› B‹identifier›`);
  });

  it("needs no spaces around it", () => {
    expect(t("A-->B")).toBe("A‹identifier› -->‹operator.arrow› B‹identifier›");
    expect(t("A<|--B")).toBe("A‹identifier› <|--‹operator.arrow› B‹identifier›");
  });

  it("splits a styled arrow into line, colour, style keywords and head", () => {
    expect(t("A -[#red,dashed]-> B")).toBe(
      "A‹identifier› -[‹operator.arrow› #red‹constant.color› ,‹delimiter› dashed‹keyword› ]->‹operator.arrow› B‹identifier›",
    );
    expect(t("A -[#blue]> B")).toBe("A‹identifier› -[‹operator.arrow› #blue‹constant.color› ]>‹operator.arrow› B‹identifier›");
  });

  it("handles sequence gates and lifeline shorthand", () => {
    expect(t("[-> A")).toBe("[->‹operator.arrow› A‹identifier›");
    expect(t("A ->]")).toBe("A‹identifier› ->]‹operator.arrow›");
    expect(t("A -> B ++ : call")).toBe(
      "A‹identifier› ->‹operator.arrow› B‹identifier› ++‹operator› :‹delimiter› call‹string.text›",
    );
    expect(classOf("A -> B --++ #gold : x", "--++")).toBe("operator");
  });
});

describe("things that only look like arrows", () => {
  it("leaves dates and dashes in message text alone", () => {
    expect(t("Alice -> Bob : 2026-01-01 --> later")).toBe(
      "Alice‹identifier› ->‹operator.arrow› Bob‹identifier› :‹delimiter› 2026-01-01 --> later‹string.text›",
    );
    expect(classOf("Jan ->> Dec : temperature -5 .. -10", "-5")).toBe("string.text");
  });

  it("reads Gantt dates as dates", () => {
    expect(t("[T] starts 2026-01-01", "@startgantt")).toBe(
      "[T]‹identifier.entity› starts‹keyword› 2026-01-01‹number.date›",
    );
  });

  it("treats dividers, delays and separators as separators", () => {
    expect(t("== Phase 2026-02-02 ==")).toBe("==‹keyword.separator› Phase 2026-02-02‹string.text.heading› ==‹keyword.separator›");
    expect(t("... 5 minutes later ...")).toBe("...‹keyword.separator› 5 minutes later‹string.text› ...‹keyword.separator›");
    expect(t("|||")).toBe("|||‹keyword.separator›");
    expect(t("--", "state S {")).toBe("--‹keyword.separator›");
    expect(t("  -- section --", "class A {")).toBe("--‹keyword.separator› section‹string.text.heading› --‹keyword.separator›");
    expect(t("  .. other ..", "class A {")).toBe("..‹keyword.separator› other‹string.text.heading› ..‹keyword.separator›");
  });

  it("keeps arrows inside quoted names and notes as text", () => {
    expect(classOf('participant "a -> b" as X', "->")).toBe("string");
    expect(t("  body -> text", "note left of A")).toBe("body -> text‹string.text›");
  });
});

describe("comments", () => {
  it("recognises line comments only at the start of a line", () => {
    expect(t("  ' a comment")).toBe("' a comment‹comment›");
    expect(classOf("Alice -> Bob : it's fine", "it's")).toBe("string.text");
  });

  it("spans block comments over lines", () => {
    const lines = tokenize("/' one\ntwo '/ Alice -> Bob");
    expect(lines[0].stack).toEqual(["root", "blockComment"]);
    expect(lines[1].stack).toEqual(["root"]);
    expect(lines[1].tokens[0]).toEqual({ text: "two '/", type: "comment" });
    expect(lines[1].tokens.at(-1)).toEqual({ text: "Bob", type: "identifier" });
  });
});

describe("colours", () => {
  it.each(["#FF0000", "#F00", "#red", "#red/blue", "#pink;line:red;line.bold;text:blue", "#back:lightblue;line:navy"])(
    "%s is one colour token",
    (colour) => {
      expect(t(`state S ${colour}`)).toBe(`state‹keyword.type› S‹identifier› ${colour}‹constant.color›`);
    },
  );

  it("does not colour a # in prose", () => {
    expect(classOf("A -> B : issue #42", "#42")).toBe("string.text");
  });
});

describe("class diagrams", () => {
  it("tokenizes stereotypes and spots", () => {
    expect(t("class Foo <<Service>>")).toBe("class‹keyword.type› Foo‹identifier› <<Service>>‹annotation.stereotype›");
    expect(t("class Foo << (S,#FF7700) Singleton >>")).toBe(
      "class‹keyword.type› Foo‹identifier› <<‹annotation.stereotype› (‹delimiter.parenthesis› S‹constant.language› ,‹delimiter› #FF7700‹constant.color› )‹delimiter.parenthesis› Singleton >>‹annotation.stereotype›",
    );
  });

  it("tokenizes nested generics without confusing them with arrows", () => {
    expect(t("class Map<K, List<V>> extends Base<K>")).toBe(
      "class‹keyword.type› Map‹identifier› <‹delimiter.angle› K‹type.identifier› ,‹delimiter› List‹type.identifier› <‹delimiter.angle› V‹type.identifier› >>‹delimiter.angle› extends‹keyword› Base‹identifier› <‹delimiter.angle› K‹type.identifier› >‹delimiter.angle›",
    );
  });

  it("tokenizes members: visibility, modifiers, methods and types", () => {
    expect(t("  +{static} count : int", "class A {")).toBe(
      "+‹annotation.visibility› {static}‹annotation› count‹identifier› :‹delimiter› int‹type.identifier›",
    );
    expect(t("  {abstract} #run(args: String[]): void", "class A {")).toBe(
      "{abstract}‹annotation› #‹annotation.visibility› run‹identifier.method› (‹delimiter.parenthesis› args‹identifier› :‹delimiter› String[]‹type.identifier› )‹delimiter.parenthesis› :‹delimiter› void‹type.identifier›",
    );
    expect(t("  - field : int", "class A {")).toBe("-‹annotation.visibility› field‹identifier› :‹delimiter› int‹type.identifier›");
    expect(t("  *id : bigint <<PK>>", "entity E {")).toBe(
      "*‹annotation.visibility› id‹identifier› :‹delimiter› bigint‹type.identifier› <<PK>>‹annotation.stereotype›",
    );
  });

  it("enters a member body only for a brace that ends the line", () => {
    expect(stackAfter("class A {")).toBe("root>classBody");
    expect(stackAfter("class A {}")).toBe("root");
    expect(stackAfter("class A {\n  +x\n}")).toBe("root");
    expect(stackAfter("package P {")).toBe("root");
    expect(stackAfter("map M {")).toBe("root>mapBody");
    expect(stackAfter("json J {")).toBe("root>jsonBody");
  });

  it("member names that are keywords stay names", () => {
    expect(t("  +order : int", "class A {")).toBe("+‹annotation.visibility› order‹identifier› :‹delimiter› int‹type.identifier›");
  });
});

describe("activity diagrams", () => {
  it("tokenizes labels with every terminator", () => {
    expect(t(":simple;")).toBe(":‹delimiter› simple‹string.text› ;‹delimiter›");
    expect(t("#red:coloured;")).toBe("#red‹constant.color› :‹delimiter› coloured‹string.text› ;‹delimiter›");
    for (const end of ["|", "<", ">", "/", "]", "}"]) {
      expect(t(`:send${end}`)).toBe(`:‹delimiter› send‹string.text› ${end}‹delimiter›`);
    }
    expect(t(":shape; <<input>>")).toBe(":‹delimiter› shape‹string.text› ;‹delimiter› <<input>>‹annotation.stereotype›");
  });

  it("keeps a label open until its terminator", () => {
    const lines = tokenize(":first line\nwith **bold**;\nstop");
    expect(lines[0].stack).toEqual(["root", "activityLabel"]);
    expect(lines[1].stack).toEqual(["root"]);
    expect(lines[1].tokens.map((x) => x.type)).toEqual(["string.text", "string.text.bold", "delimiter"]);
    expect(lines[2].tokens[0]).toEqual({ text: "stop", type: "keyword.control" });
  });

  it("tells use case actors from activity labels", () => {
    expect(t(":Admin: --> (Login)")).toBe(":Admin:‹identifier.entity› -->‹operator.arrow› (Login)‹identifier.entity›");
    expect(t(":Main Admin: as Admin")).toBe(":Main Admin:‹identifier.entity› as‹keyword› Admin‹identifier›");
    expect(t(":step: done;")).toBe(":‹delimiter› step: done‹string.text› ;‹delimiter›");
  });

  it("tokenizes swimlanes, conditions and arrow labels", () => {
    expect(t("|#gold|l| Lane title")).toBe(
      "|‹delimiter› #gold‹constant.color› |‹delimiter› l‹identifier.entity› |‹delimiter› Lane title‹identifier.entity›",
    );
    expect(t("if (a > b?) then (yes)")).toBe(
      "if‹keyword.control› (‹delimiter.parenthesis› a > b?‹string.text› )‹delimiter.parenthesis› then‹keyword.control› (‹delimiter.parenthesis› yes‹string.text› )‹delimiter.parenthesis›",
    );
    expect(t("else (no)")).toBe("else‹keyword.control› (‹delimiter.parenthesis› no‹string.text› )‹delimiter.parenthesis›");
    expect(t("-> yes;")).toBe("->‹operator.arrow› yes‹string.text› ;‹delimiter›");
    expect(t("-[#green]-> ok;")).toBe("-[‹operator.arrow› #green‹constant.color› ]->‹operator.arrow› ok‹string.text› ;‹delimiter›");
    expect(t("repeat :step;")).toBe("repeat‹keyword.control› :‹delimiter› step‹string.text› ;‹delimiter›");
    expect(t("fork again")).toBe("fork again‹keyword.control›");
  });

  it("legacy syntax: (*) and bracketed arrow labels", () => {
    expect(t('(*) --> "First"')).toBe('(*)‹constant.language› -->‹operator.arrow› "First"‹string›');
    expect(t('-->[yes] "Second"')).toBe('-->‹operator.arrow› [yes]‹identifier.entity› "Second"‹string›');
  });
});

describe("notes and other prose blocks", () => {
  it("single-line notes end with the line", () => {
    expect(t("note left of A: hello **w**")).toBe(
      "note‹keyword› left‹keyword› of‹keyword› A‹identifier› :‹delimiter› hello‹string.text› **w**‹string.text.bold›",
    );
    expect(stackAfter("note left of A: hello")).toBe("root");
    expect(stackAfter('note "floating" as N1')).toBe("root");
    expect(t("/ note right: same level")).toBe("/‹operator› note‹keyword› right‹keyword› :‹delimiter› same level‹string.text›");
  });

  it("multi-line notes run to their end keyword", () => {
    expect(stackAfter("note left of A #pink")).toBe("root>noteBody");
    expect(stackAfter("note right of Foo::bar")).toBe("root>noteBody");
    expect(stackAfter("note as N\ntext\nend note")).toBe("root");
    expect(stackAfter("rnote over A\ntext\nendrnote")).toBe("root");
    expect(stackAfter("ref over A, B\ntext\nend ref")).toBe("root");
    expect(stackAfter("ref over A, B : inline")).toBe("root");
    expect(t("end note", "note left", "text")).toBe("end note‹keyword›");
  });

  it("title, header, footer, caption and legend come in both forms", () => {
    expect(t("title Simple <b>x</b>")).toBe("title‹keyword› Simple‹string.text› <b>‹string.text.tag› x‹string.text› </b>‹string.text.tag›");
    expect(stackAfter("title\nBig")).toBe("root>proseBlock.title");
    expect(stackAfter("title\nBig\nend title")).toBe("root");
    expect(stackAfter("legend top left\nx\nendlegend")).toBe("root");
    expect(stackAfter("center footer\nx\nendfooter")).toBe("root");
    expect(stackAfter("header\nx\nend header")).toBe("root");
  });

  it("highlights creole markup inside text", () => {
    const text = "A -> B : **b** //i// \"\"m\"\" --s-- __u__ ~~w~~ <b>x</b> <color:red>r</color> <&check> <:smile:> <$spr> [[http://x label]]";
    expect(line(text).slice(4)).toEqual([
      "**b**‹string.text.bold›",
      "//i//‹string.text.italic›",
      '""m""‹string.text.code›',
      "--s--‹string.text.strike›",
      "__u__‹string.text.underline›",
      "~~w~~‹string.text.underline›",
      "<b>‹string.text.tag›",
      "x‹string.text›",
      "</b>‹string.text.tag›",
      "<color:red>‹string.text.tag›",
      "r‹string.text›",
      "</color>‹string.text.tag›",
      "<&check>‹string.text.icon›",
      "<:smile:>‹string.text.icon›",
      "<$spr>‹string.text.icon›",
      "[[http://x label]]‹string.text.link›",
    ]);
  });

  it("does not take a URL's slashes for italics", () => {
    expect(classOf("A -> B : see http://a.example and http://b.example", "and")).toBe("string.text");
  });
});

describe("preprocessor", () => {
  it("tokenizes directives, variables and builtin calls", () => {
    expect(t('!$x = %strlen("a") + 1')).toBe(
      '!‹keyword.directive› $x‹variable.preprocessor› =‹operator› %strlen‹identifier.function.builtin› (‹delimiter.parenthesis› "a"‹string› )‹delimiter.parenthesis› +‹operator› 1‹number›',
    );
    expect(t("!include <C4/C4_Context>")).toBe("!include‹keyword.directive› <C4/C4_Context>‹string›");
    expect(t("!theme vibrant")).toBe("!theme‹keyword.directive› vibrant‹attribute.value›");
    expect(t("  !endif")).toBe("!endif‹keyword.directive›");
  });

  it("tokenizes procedure and function definitions", () => {
    expect(t('!procedure $p($a, $b="x")')).toBe(
      '!procedure‹keyword.directive› $p‹identifier.function› (‹delimiter.parenthesis› $a‹variable.parameter› ,‹delimiter› $b‹variable.parameter› =‹operator› "x"‹string› )‹delimiter.parenthesis›',
    );
    expect(t("!function $f($a) !return $a + 1")).toBe(
      "!function‹keyword.directive› $f‹identifier.function› (‹delimiter.parenthesis› $a‹variable.parameter› )‹delimiter.parenthesis› !return‹keyword.directive› $a‹variable.preprocessor› +‹operator› 1‹number›",
    );
    expect(classOf("!unquoted procedure $q($n)", "!unquoted procedure")).toBe("keyword.directive");
  });

  it("tokenizes calls, including stdlib-style macros", () => {
    expect(t('$p("a", 1)')).toBe('$p‹identifier.function› (‹delimiter.parenthesis› "a"‹string› ,‹delimiter› 1‹number› )‹delimiter.parenthesis›');
    expect(t('Person(admin, "Admin", $sprite="person")')).toBe(
      'Person‹identifier.function› (‹delimiter.parenthesis› admin‹identifier› ,‹delimiter› "Admin"‹string› ,‹delimiter› $sprite‹variable.parameter› =‹delimiter› "person"‹string› )‹delimiter.parenthesis›',
    );
    expect(stackAfter('System_Boundary(b1, "Bank") {')).toBe("root");
  });

  it("highlights variables and builtins inside text, but not prices", () => {
    expect(t("Alice -> Bob : $x and %date()").split(" ").slice(4).join(" ")).toBe(
      "$x‹variable.preprocessor› and‹string.text› %date‹identifier.function.builtin› ()‹string.text›",
    );
    expect(classOf("Alice -> Bob : costs $5", "$5")).toBe("string.text");
  });

  it("treats a !define replacement as diagram source", () => {
    expect(t("!define TABLE(name) database name <<table>>")).toBe(
      "!define‹keyword.directive› TABLE‹identifier.function› (‹delimiter.parenthesis› name‹variable.parameter› )‹delimiter.parenthesis› database‹identifier› name‹identifier› <<table>>‹annotation.stereotype›",
    );
  });
});

describe("skinparam and <style>", () => {
  it("tokenizes single-line skinparams", () => {
    expect(t("skinparam monochrome true")).toBe("skinparam‹keyword› monochrome‹attribute.name› true‹constant.language›");
    expect(t("skinparam ArrowColor #red")).toBe("skinparam‹keyword› ArrowColor‹attribute.name› #red‹constant.color›");
    expect(t("skinparam defaultFontSize 14")).toBe("skinparam‹keyword› defaultFontSize‹attribute.name› 14‹number›");
  });

  it("tokenizes skinparam blocks", () => {
    expect(t("  BackgroundColor<<X>> White", "skinparam class {")).toBe(
      "BackgroundColor‹attribute.name› <<X>>‹annotation.stereotype› White‹constant.color›",
    );
    expect(stackAfter("skinparam class {\n  FontSize 12\n}")).toBe("root");
    expect(stackAfter("skinparam {\n  shadowing false")).toBe("root>skinparamBlock");
  });

  it("tokenizes style blocks", () => {
    expect(t(".foo { FontColor red }", "<style>")).toBe(
      ".foo‹tag.selector› {‹delimiter.curly› FontColor‹attribute.name› red‹constant.color› }‹delimiter.curly›",
    );
    expect(t("  LineColor: #333;", "<style>", "classDiagram {")).toBe(
      "LineColor‹attribute.name› :‹delimiter› #333‹constant.color› ;‹delimiter›",
    );
    expect(stackAfter("<style>\nnode { FontSize 12 }\n</style>")).toBe("root");
  });
});

describe("block tags", () => {
  it("highlights the tag and an optional name", () => {
    expect(t("@startuml diagram name")).toBe("@startuml‹metatag› diagram name‹metatag.argument›");
    expect(t("@enduml")).toBe("@enduml‹metatag›");
  });

  it.each([
    ["mindmap", "mindmap"],
    ["wbs", "mindmap"],
    ["gantt", "gantt"],
    ["salt", "salt"],
    ["json", "json"],
    ["yaml", "yaml"],
    ["nwdiag", "nwdiagFamily"],
    ["ebnf", "ebnf"],
    ["regex", "regex"],
    ["chen", "chen"],
    ["dot", "dot"],
    ["ditaa", "opaque"],
    ["math", "formula"],
    ["latex", "formula"],
    ["creole", "creoleBlock"],
    ["chronology", "genericBlock"],
    ["somethingnew", "genericBlock"],
  ])("@start%s enters the %s state and @end leaves it", (tag, state) => {
    expect(stackAfter(`@start${tag}`)).toBe(`root>${state}`);
    expect(stackAfter(`@start${tag}\n@end${tag}`)).toBe("root");
  });

  it("stays in the UML dialect for @startuml and for text before any tag", () => {
    expect(stackAfter("@startuml")).toBe("root");
    expect(t("Alice -> Bob : hi")).toBe("Alice‹identifier› ->‹operator.arrow› Bob‹identifier› :‹delimiter› hi‹string.text›");
  });

  it("recovers at a block boundary when a multi-line construct was left open", () => {
    for (const open of ["note left", "/' comment", ":label", "class A {", "legend", "skinparam x {", "<style>"]) {
      const lines = tokenize(`@startuml\n${open}\nunfinished\n@enduml\n@startuml\nAlice -> Bob`);
      expect(lines[3].stack, open).toEqual(["root"]);
      expect(lines[3].tokens[0], open).toEqual({ text: "@enduml", type: "metatag" });
      expect(lines[5].tokens.map((x) => x.type), open).toContain("operator.arrow");
    }
  });

  it("starts the next block cleanly when the previous one was never closed", () => {
    const lines = tokenize("@startmindmap\n* a\n@startuml\nAlice -> Bob");
    expect(lines[2].stack).toEqual(["root"]);
    expect(lines[3].tokens).toContainEqual({ text: "->", type: "operator.arrow" });
  });
});

describe("other diagram families", () => {
  it("gantt", () => {
    expect(t("[Task one] lasts 5 days and is 20% completed", "@startgantt")).toBe(
      "[Task one]‹identifier.entity› lasts‹keyword› 5‹number› days‹keyword› and‹keyword.control› is‹keyword› 20%‹number› completed‹keyword›",
    );
    expect(t("then [B] starts at [A]'s end", "@startgantt")).toBe(
      "then‹keyword.control› [B]‹identifier.entity› starts‹keyword› at‹keyword› [A]‹identifier.entity› 's‹keyword› end‹keyword›",
    );
    expect(t("-- Phase --", "@startgantt")).toBe("--‹keyword.separator› Phase‹string.text.heading› --‹keyword.separator›");
    expect(line("[A] is colored in Lavender/LightBlue", ["@startgantt"]).slice(-3)).toEqual([
      "Lavender‹constant.color›",
      "/‹›",
      "LightBlue‹constant.color›",
    ]);
  });

  it("mindmap and WBS", () => {
    expect(t("**[#Orange] Colours", "@startmindmap")).toBe("**‹keyword.marker› [#Orange]‹constant.color› Colours‹string.text›");
    expect(t("*_ boxless", "@startmindmap")).toBe("*_‹keyword.marker› boxless‹string.text›");
    expect(t("**< left", "@startwbs")).toBe("**<‹keyword.marker› left‹string.text›");
    expect(t("*** slip -> 2 weeks", "@startmindmap")).toBe("***‹keyword.marker› slip -> 2 weeks‹string.text›");
    expect(stackAfter("@startmindmap\n**:multi\nline;")).toBe("root>mindmap");
  });

  it("salt, standalone and inside @startuml", () => {
    expect(t('[OK] | "text" | ^list^ | () radio | [X] check', "@startsalt", "{")).toBe(
      '[OK]‹identifier.entity› |‹delimiter› "text"‹string› |‹delimiter› ^list^‹identifier.entity› |‹delimiter› ()‹constant.language› radio‹string.text› |‹delimiter› [X]‹constant.language› check‹string.text›',
    );
    expect(stackAfter("@startuml\nsalt\n{\n  [OK]")).toBe("root>saltBlock");
    expect(stackAfter("@startuml\nsalt\n{\n  { a | b }\n}")).toBe("root");
  });

  it("nwdiag", () => {
    expect(t('network dmz { address = "10.0.0.0/24" }', "nwdiag {")).toBe(
      'network‹keyword.type› dmz‹identifier› {‹delimiter.curly› address‹attribute.name› =‹delimiter› "10.0.0.0/24"‹string› }‹delimiter.curly›',
    );
    expect(stackAfter("nwdiag {\n  network a {\n  }\n}")).toBe("root");
  });

  it("json and yaml", () => {
    expect(t('{ "a": [1, true, null, "s"] }', "@startjson")).toBe(
      '{‹delimiter.curly› "a"‹string.key› :‹delimiter› [‹delimiter.square› 1‹number› ,‹delimiter› true‹constant.language› ,‹delimiter› null‹constant.language› ,‹delimiter› "s"‹string› ]‹delimiter.square› }‹delimiter.curly›',
    );
    expect(t('#highlight "a" / "b"', "@startjson")).toBe('#highlight‹keyword.directive› "a"‹string› /‹delimiter› "b"‹string›');
    expect(t("key: value # comment", "@startyaml")).toBe("key‹string.key› :‹delimiter› value‹string› # comment‹comment›");
    expect(t("- 8080", "@startyaml")).toBe("-‹operator› 8080‹number›");
    expect(t('#highlight "a"', "@startyaml")).toBe('#highlight‹keyword.directive› "a"‹string›');
  });

  it("ebnf, regex and chen", () => {
    expect(t("rule = \"a\" | 'b' , { c } ; (* note *)", "@startebnf")).toBe(
      "rule‹type.identifier› =‹operator› \"a\"‹string› |‹operator› 'b'‹string› ,‹operator› {‹delimiter.curly› c‹identifier› }‹delimiter.curly› ;‹operator› (* note *)‹comment›",
    );
    expect(t("[a-z]+\\d{2,}", "@startregex")).toBe("[a-z]‹regexp.class› +‹regexp.operator› \\d‹regexp.escape› {2,}‹regexp.operator›");
    expect(t("A -(1,N)- R", "@startchen")).toBe("A‹identifier› -(1,N)-‹operator.arrow› R‹identifier›");
  });

  it("opaque bodies are left as raw text", () => {
    expect(t("+---+ --> /---\\", "@startditaa")).toBe("+---+ --> /---\\‹source.raw›");
  });
});

describe("names that are also keywords", () => {
  it("only treats a type keyword as a declaration when a name follows", () => {
    expect(t("order -> state : x")).toBe("order‹identifier› ->‹operator.arrow› state‹identifier› :‹delimiter› x‹string.text›");
    expect(t("actor -> system : call")).toBe("actor‹identifier› ->‹operator.arrow› system‹identifier› :‹delimiter› call‹string.text›");
    expect(t("database -> queue")).toBe("database‹identifier› ->‹operator.arrow› queue‹identifier›");
  });

  it("the name after a type keyword is a name", () => {
    expect(t("class order")).toBe("class‹keyword.type› order‹identifier›");
    expect(t("participant end")).toBe("participant‹keyword.type› end‹identifier›");
  });
});

describe("statements", () => {
  it("timing", () => {
    expect(t("@+100")).toBe("@+100‹constant.anchor›");
    expect(t("WB is Idle")).toBe("WB‹identifier› is‹keyword› Idle‹identifier›");
    expect(t("clock clk with period 50")).toBe("clock‹keyword.type› clk‹identifier› with‹keyword› period‹keyword› 50‹number›");
  });

  it("commands", () => {
    expect(t("hide empty members")).toBe("hide‹keyword› empty‹keyword› members‹keyword›");
    expect(t("left to right direction")).toBe("left to right direction‹keyword›");
    expect(t('autonumber 1 10 "<b>[000]"')).toBe('autonumber‹keyword› 1‹number› 10‹number› "<b>[000]"‹string›');
    expect(t("return ok")).toBe("return‹keyword.control› ok‹string.text›");
  });

  it("state, use case and component literals", () => {
    expect(t("[*] --> S1 : go")).toBe("[*]‹constant.language› -->‹operator.arrow› S1‹identifier› :‹delimiter› go‹string.text›");
    expect(t("usecase (Login) as UC1")).toBe("usecase‹keyword.type› (Login)‹identifier.entity› as‹keyword› UC1‹identifier›");
    expect(t("[Comp] ..> HTTP : use")).toBe("[Comp]‹identifier.entity› ..>‹operator.arrow› HTTP‹identifier› :‹delimiter› use‹string.text›");
    expect(t('() "API" as api')).toBe('()‹identifier.entity› "API"‹string› as‹keyword› api‹identifier›');
  });
});

describe("quoted strings", () => {
  it("highlights escapes, variables and sprites inside a quoted name", () => {
    expect(t('participant "Web\\nApp" as W')).toBe(
      'participant‹keyword.type› "Web‹string› \\n‹string.escape› App"‹string› as‹keyword› W‹identifier›',
    );
    expect(classOf('rectangle "$label" as $alias', "$label")).toBe("variable.preprocessor");
    expect(classOf('rectangle "<$server> Edge" as e', "<$server>")).toBe("string.text.icon");
  });

  it("ends an unterminated string with the line", () => {
    expect(stackAfter('participant "unterminated')).toBe("root");
    expect(stackAfter('A -> B : say "hi')).toBe("root");
  });

  it("lets a label after `as` run over several lines", () => {
    expect(stackAfter('usecase UC2 as "Place order')).toBe("root>longString");
    expect(stackAfter('usecase UC2 as "Place order\n--\nincludes payment"')).toBe("root");
  });
});
