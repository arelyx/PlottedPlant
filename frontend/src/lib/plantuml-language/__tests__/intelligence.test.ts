import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyze } from "../core/analysis";
import { complete } from "../core/completion";
import { hover } from "../core/hover";
import { definition, documentSymbols, highlights, prepareRename, references, rename, semanticTokens, type OutlineNode } from "../core/navigation";
import { signatureHelp } from "../core/signature";
import { applyEdits, corpus, CURSOR, withCursor } from "./intelligence-helpers";

function renameAt(source: string, newName: string): string {
  const { text, analysis, line, column } = withCursor(source);
  const result = rename(analysis, line, column, newName);
  if (!result.ok) return `REJECTED: ${result.reason}`;
  return applyEdits(text, result.edits);
}

describe("rename", () => {
  it("rewrites the declaration and every reference of a participant", () => {
    const source = `@startuml\nparticipant Ali${CURSOR}ce\nAlice -> Bob: hi Alice\nactivate Alice\nnote left of Alice: Alice waits\nBob --> Alice\n@enduml`;
    expect(renameAt(source, "Carol")).toBe(
      "@startuml\nparticipant Carol\nCarol -> Bob: hi Alice\nactivate Carol\nnote left of Carol: Alice waits\nBob --> Carol\n@enduml",
    );
  });

  it("renames from a reference just as from the declaration", () => {
    const source = `@startuml\nparticipant Alice\nAlice -> Bob\nBob --> Ali${CURSOR}ce\n@enduml`;
    expect(renameAt(source, "Carol")).toBe("@startuml\nparticipant Carol\nCarol -> Bob\nBob --> Carol\n@enduml");
  });

  it("renames an alias without touching its quoted label, a look-alike label, a note body or a comment", () => {
    const source = [
      "@startuml",
      `participant "DB" as D${CURSOR}B`,
      "' DB is the database",
      "DB -> App: DB says hi to DB",
      "note over DB",
      "  DB -> App is shown above",
      "end note",
      "/' DB again '/",
      "App -> DB",
      "@enduml",
    ].join("\n");
    expect(renameAt(source, "Store").split("\n")).toEqual([
      "@startuml",
      'participant "DB" as Store',
      "' DB is the database",
      "Store -> App: DB says hi to DB",
      "note over Store",
      "  DB -> App is shown above",
      "end note",
      "/' DB again '/",
      "App -> Store",
      "@enduml",
    ]);
  });

  it("renames only the quoted label when the cursor is on it", () => {
    const source = `@startuml\nparticipant "Web Bro${CURSOR}wser" as Browser\nBrowser -> Browser: Web Browser\n@enduml`;
    expect(renameAt(source, "Mobile App")).toBe('@startuml\nparticipant "Mobile App" as Browser\nBrowser -> Browser: Web Browser\n@enduml');
  });

  it("keeps quotes around quoted names, and adds them when the new name needs them", () => {
    const quoted = `@startuml\n"Bank Cust${CURSOR}omer" -> Teller: hi\nTeller --> "Bank Customer"\n@enduml`;
    expect(renameAt(quoted, "Client")).toBe('@startuml\n"Client" -> Teller: hi\nTeller --> "Client"\n@enduml');
    const bare = `@startuml\nactor Cust${CURSOR}omer\nCustomer -> Teller\n@enduml`;
    expect(renameAt(bare, "Bank Customer")).toBe('@startuml\nactor "Bank Customer"\n"Bank Customer" -> Teller\n@enduml');
  });

  it("scopes the rename to the block the symbol lives in", () => {
    const source = `@startuml\nAli${CURSOR}ce -> Bob\n@enduml\n@startuml\nclass Alice\nAlice --> Bob\n@enduml\n@startmindmap\n* Alice\n@endmindmap`;
    expect(renameAt(source, "Carol")).toBe(
      "@startuml\nCarol -> Bob\n@enduml\n@startuml\nclass Alice\nAlice --> Bob\n@enduml\n@startmindmap\n* Alice\n@endmindmap",
    );
  });

  it("renames classes through extends, relations, notes and member lines", () => {
    const source = `@startuml\nclass Sha${CURSOR}pe {\n  +Shape()\n}\nclass Circle extends Shape\nShape <|-- Square : is a Shape\nnote top of Shape: Shape\nShape : +area()\n@enduml`;
    expect(renameAt(source, "Figure")).toBe(
      "@startuml\nclass Figure {\n  +Shape()\n}\nclass Circle extends Figure\nFigure <|-- Square : is a Shape\nnote top of Figure: Shape\nFigure : +area()\n@enduml",
    );
  });

  it("renames bracketed and parenthesised names in place", () => {
    const component = `@startuml\n[Web A${CURSOR}pp]\n[Web App] --> [DB] : Web App\n@enduml`;
    expect(renameAt(component, "Site")).toBe("@startuml\n[Site]\n[Site] --> [DB] : Web App\n@enduml");
    const usecase = `@startuml\nactor User\nUser --> (Log ${CURSOR}in)\n(Log in) .> (Verify)\n@enduml`;
    expect(renameAt(usecase, "Sign in")).toBe("@startuml\nactor User\nUser --> (Sign in)\n(Sign in) .> (Verify)\n@enduml");
  });

  it("renames Gantt tasks, aliases and resources", () => {
    const task = `@startgantt\n[Des${CURSOR}ign] lasts 5 days\n[Build] starts at [Design]'s end\n@endgantt`;
    expect(renameAt(task, "Design phase")).toBe("@startgantt\n[Design phase] lasts 5 days\n[Build] starts at [Design phase]'s end\n@endgantt");
    const alias = `@startgantt\n[Design] as [D] lasts 5 days\n[Build] starts at [${CURSOR}D]'s end\n@endgantt`;
    expect(renameAt(alias, "DS")).toBe("@startgantt\n[Design] as [DS] lasts 5 days\n[Build] starts at [DS]'s end\n@endgantt");
    const resource = `@startgantt\n[A] on {Al${CURSOR}ice} lasts 2 days\n{Alice} is off on 2026-01-12\n@endgantt`;
    expect(renameAt(resource, "Bob")).toBe("@startgantt\n[A] on {Bob} lasts 2 days\n{Bob} is off on 2026-01-12\n@endgantt");
  });

  it("renames states, swimlanes and timing participants", () => {
    expect(renameAt(`@startuml\n[*] --> Id${CURSOR}le\nIdle --> Busy\nIdle : waiting\n@enduml`, "Ready")).toBe(
      "@startuml\n[*] --> Ready\nReady --> Busy\nReady : waiting\n@enduml",
    );
    expect(renameAt(`@startuml\n|Lane ${CURSOR}One|\nstart\n|Lane Two|\n:b;\n|Lane One|\nstop\n@enduml`, "Sales team")).toBe(
      "@startuml\n|Sales team|\nstart\n|Lane Two|\n:b;\n|Sales team|\nstop\n@enduml",
    );
    expect(renameAt(`@startuml\nconcise "User" as W${CURSOR}U\n@0\nWU is Idle\n@WU\n0 is Busy\n@enduml`, "USR")).toBe(
      '@startuml\nconcise "User" as USR\n@0\nUSR is Idle\n@USR\n0 is Busy\n@enduml',
    );
  });

  it("renames preprocessor variables and procedures everywhere, labels included", () => {
    const variable = `@startuml\n!$na${CURSOR}me = "x"\nA -> B : hello $name\nnote left: $name\n@enduml`;
    expect(renameAt(variable, "who")).toBe('@startuml\n!$who = "x"\nA -> B : hello $who\nnote left: $who\n@enduml');
    const procedure = `@startuml\n!procedure $send($a, $b)\n  $a -> $b\n!endprocedure\n$se${CURSOR}nd(X, Y)\n$send(Y, X)\n@enduml`;
    expect(renameAt(procedure, "$msg")).toBe("@startuml\n!procedure $msg($a, $b)\n  $a -> $b\n!endprocedure\n$msg(X, Y)\n$msg(Y, X)\n@enduml");
    const parameter = `@startuml\n!procedure $send($a, $b)\n  $${CURSOR}a -> $b : from $a\n!endprocedure\n!$a = 1\n@enduml`;
    expect(renameAt(parameter, "$from")).toBe("@startuml\n!procedure $send($from, $b)\n  $from -> $b : from $from\n!endprocedure\n!$a = 1\n@enduml");
  });

  it("refuses politely on keywords, text and comments", () => {
    const cases = [
      `@startuml\npartici${CURSOR}pant Alice\n@enduml`,
      `@startuml\nAlice -> Bob: hel${CURSOR}lo\n@enduml`,
      `@startuml\n' Ali${CURSOR}ce\nAlice -> Bob\n@enduml`,
      `@startuml\nAlice -> Bob\nnote left\n  Ali${CURSOR}ce\nend note\n@enduml`,
      `@startmindmap\n* Ro${CURSOR}ot\n@endmindmap`,
      `@start${CURSOR}uml\n@enduml`,
    ];
    for (const source of cases) {
      const { analysis, line, column } = withCursor(source);
      const target = prepareRename(analysis, line, column);
      expect(target.ok, source).toBe(false);
      if (!target.ok) expect(target.reason.length).toBeGreaterThan(10);
    }
  });

  it("offers the exact name range as the rename target", () => {
    const { analysis, line, column } = withCursor(`@startuml\nparticipant "Web" as Bro${CURSOR}wser\n@enduml`);
    expect(prepareRename(analysis, line, column)).toEqual({
      ok: true,
      range: { startLine: 1, startColumn: 21, endLine: 1, endColumn: 28 },
      placeholder: "Browser",
    });
  });

  it("refuses names the dialect cannot express, and clashes", () => {
    expect(renameAt(`@startuml\n[*] --> Id${CURSOR}le\n@enduml`, "Not Busy")).toMatch(/^REJECTED: A state name .* alias/);
    expect(renameAt(`@startuml\nAli${CURSOR}ce -> Bob\n@enduml`, "Bob")).toMatch(/^REJECTED: "Bob" already names/);
    expect(renameAt(`@startuml\n!$x${CURSOR} = 1\n@enduml`, "a b")).toMatch(/^REJECTED: Preprocessor names/);
    expect(renameAt(`@startuml\n"Ali${CURSOR}ce" -> Bob\n@enduml`, 'A"B')).toMatch(/^REJECTED: .*double quote/);
    expect(renameAt(`@startuml\nAli${CURSOR}ce -> Bob\n@enduml`, "  ")).toMatch(/^REJECTED: .*empty/);
  });

  it("produces valid PlantUML on the corpus (every symbol renamed, document still parses the same)", () => {
    const dir = path.join(__dirname, "corpus");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml"))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const analysis = analyze(text);
      for (const symbol of analysis.symbols) {
        if (symbol.category === "structure") continue;
        const occ = symbol.declaration;
        const result = rename(analysis, occ.line, occ.startColumn, symbol.name.startsWith("$") ? "$renamed_x" : "renamed_x");
        if (!result.ok) continue;
        const after = analyze(applyEdits(text, result.edits));
        // Same number of symbols, same occurrence counts: nothing merged, nothing lost.
        expect(after.symbols.map((s) => s.occurrences.length), `${file}: ${symbol.name}`).toEqual(analysis.symbols.map((s) => s.occurrences.length));
      }
    }
  });
});

describe("definition, references, highlights", () => {
  const source = `@startuml\nparticipant "Web Browser" as Browser\nactor User\nUser -> Browser: open\nBrowser --> Us${CURSOR}er: done\n@enduml`;
  const { analysis, line, column } = withCursor(source);

  it("goes to the declaration", () => {
    expect(definition(analysis, line, column)).toEqual({ startLine: 2, startColumn: 6, endLine: 2, endColumn: 10 });
  });

  it("goes to the first use of an implicitly declared name", () => {
    const implicit = withCursor(`@startuml\nAlice -> Bob\nBob --> Ali${CURSOR}ce\n@enduml`);
    expect(definition(implicit.analysis, implicit.line, implicit.column)).toEqual({ startLine: 1, startColumn: 0, endLine: 1, endColumn: 5 });
  });

  it("finds all references, with or without the declaration", () => {
    expect(references(analysis, line, column).map((r) => r.startLine + 1)).toEqual([3, 4, 5]);
    expect(references(analysis, line, column, false).map((r) => r.startLine + 1)).toEqual([4, 5]);
  });

  it("highlights the same symbol and marks the declaration as a write", () => {
    expect(highlights(analysis, line, column).map((h) => [h.range.startLine + 1, h.kind])).toEqual([[3, "write"], [4, "read"], [5, "read"]]);
  });

  it("returns nothing on keywords, labels and comments", () => {
    const keyword = withCursor(`@startuml\nact${CURSOR}or User\nUser -> B: User\n@enduml`);
    expect(definition(keyword.analysis, keyword.line, keyword.column)).toBeUndefined();
    const label = withCursor(`@startuml\nactor User\nUser -> B: Us${CURSOR}er\n@enduml`);
    expect(references(label.analysis, label.line, label.column)).toEqual([]);
    expect(highlights(label.analysis, label.line, label.column)).toEqual([]);
  });
});

function outline(nodes: OutlineNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [`${"  ".repeat(depth)}${n.name}${n.detail ? ` [${n.detail}]` : ""}`, ...outline(n.children, depth + 1)]);
}

describe("document symbols (outline)", () => {
  it("nests a class diagram by package, type and member", () => {
    const nodes = documentSymbols(analyze(corpus("template-class-with-packages.puml")));
    expect(outline(nodes).slice(0, 9)).toEqual([
      "@startuml [Class diagram]",
      "  Domain [package]",
      "    Entity [class]",
      "      id [+id: int]",
      "    User [class]",
      "      email [+email: String]",
      "    Document [class]",
      "      title [+title: String]",
      "      content [+content: String]",
    ]);
  });

  it("shows a mindmap as its tree", () => {
    expect(outline(documentSymbols(analyze(corpus("intel-mindmap.puml"))))).toEqual([
      "@startmindmap [Mind map]",
      "  Project",
      "    Planning",
      "      Goals",
      "      Budget",
      "    Execution",
      "      boxless leaf",
      "    Review",
      "    Risks",
      "      Schedule",
      "    Team",
      "    Plus side",
      "  Multi",
    ]);
  });

  it("lists sequence participants and groups, Gantt tasks, and one node per block", () => {
    const sequence = outline(documentSymbols(analyze(corpus("template-sequence-with-grouping.puml"))));
    expect(sequence).toEqual([
      "@startuml [Sequence diagram]",
      "  Client [participant]",
      "  Server [participant]",
      "  Cache [participant]",
      "  alt Cache hit [alt]",
      "    else Cache miss [else]",
      "  loop Every 60 seconds [loop]",
    ]);
    const gantt = outline(documentSymbols(analyze(corpus("intel-gantt.puml"))));
    expect(gantt.slice(0, 4)).toEqual(["@startgantt [Gantt chart]", "  Design phase (D) [task]", "  Build (B) [task]", "  Test [task]"]);
    const multi = documentSymbols(analyze(corpus("intel-multi-block.puml")));
    expect(multi.map((n) => n.detail)).toEqual(["Sequence diagram", "Class diagram", "Mind map"]);
  });

  it("uses the title as the block name and keeps every selection inside its range", () => {
    const nodes = documentSymbols(analyze("@startuml\ntitle Checkout flow\nAlice -> Bob\n@enduml"));
    expect(nodes[0].name).toBe("Checkout flow");
    const dir = path.join(__dirname, "corpus");
    const check = (node: OutlineNode, file: string) => {
      const r = node.range;
      const s = node.selectionRange;
      const inside =
        (s.startLine > r.startLine || (s.startLine === r.startLine && s.startColumn >= r.startColumn)) &&
        (s.endLine < r.endLine || (s.endLine === r.endLine && s.endColumn <= r.endColumn));
      expect(inside, `${file}: ${node.name}`).toBe(true);
      expect(node.name.length, `${file}: empty name`).toBeGreaterThan(0);
      node.children.forEach((child) => check(child, file));
    };
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml"))) {
      documentSymbols(analyze(fs.readFileSync(path.join(dir, file), "utf8"))).forEach((node) => check(node, file));
    }
  });
});

describe("semantic tokens", () => {
  it("types declarations and references by symbol category", () => {
    const analysis = analyze(
      '@startuml\n!$c = "red"\n!procedure $p($a)\n$a -> X\n!endprocedure\npackage P {\n  interface I\n  class A {\n    +f: int\n  }\n  enum E {\n    ONE\n  }\n}\nA ..|> I\n$p(A)\n@enduml',
    );
    const tokens = semanticTokens(analysis).map((t) => `${t.line + 1}:${analysis.lines[t.line].slice(t.startColumn, t.startColumn + t.length)}:${t.type}${t.declaration ? ":decl" : ""}`);
    expect(tokens).toEqual([
      "2:$c:variable:decl",
      "3:$p:function:decl",
      "3:$a:parameter:decl",
      "4:$a:parameter",
      "4:X:class:decl",
      "6:P:namespace:decl",
      "7:I:type:decl",
      "8:A:class:decl",
      "9:f:property:decl",
      "11:E:type:decl",
      "12:ONE:enumMember:decl",
      "15:A:class",
      "15:I:type",
      "16:$p:function",
    ]);
  });

  it("emits sorted, non-overlapping tokens for every corpus file", () => {
    const dir = path.join(__dirname, "corpus");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml"))) {
      const tokens = semanticTokens(analyze(fs.readFileSync(path.join(dir, file), "utf8")));
      for (let i = 1; i < tokens.length; i++) {
        const a = tokens[i - 1];
        const b = tokens[i];
        expect(b.line > a.line || (b.line === a.line && b.startColumn >= a.startColumn + a.length), `${file} line ${b.line + 1}`).toBe(true);
      }
    }
  });
});

describe("hover", () => {
  const at = (source: string) => {
    const { analysis, line, column } = withCursor(source);
    return hover(analysis, line, column);
  };

  it("describes a symbol: declaration line, kind and reference count", () => {
    const result = at(`@startuml\nparticipant "Web Browser" as Browser\nBrowser -> DB\nDB --> Bro${CURSOR}wser\n@enduml`);
    expect(result?.contents[0]).toContain('participant "Web Browser" as Browser');
    expect(result?.contents[1]).toContain("**participant** `Browser`");
    expect(result?.contents[1]).toContain("declared on line 2 · 2 references");
    expect(result).toMatchObject({ startColumn: 7, endColumn: 14 });
  });

  it("says when a name is declared by first use", () => {
    expect(at(`@startuml\nAlice -> Bob\nBob --> Ali${CURSOR}ce\n@enduml`)?.contents[1]).toContain("declared by first use on line 2 · 1 reference");
  });

  it("shows the signature of user procedures and builtin functions", () => {
    expect(at(`@startuml\n!procedure $send($from, $to)\n!endprocedure\n$se${CURSOR}nd(A, B)\n@enduml`)?.contents[1]).toContain("**!procedure** `$send($from, $to)`");
    const builtin = at(`@startuml\n!$n = %str${CURSOR}len("abc")\n@enduml`);
    expect(builtin?.contents[0]).toContain("%strlen(text)");
  });

  it("shows the hex value and a swatch for colour names and hex colours", () => {
    const named = at(`@startuml\nparticipant A #Light${CURSOR}Blue\n@enduml`);
    expect(named?.html).toBe(true);
    expect(named?.contents[0]).toContain("#add8e6");
    expect(named?.contents[0]).toContain('<span style="color:#add8e6;">');
    expect(at(`@startuml\nskinparam ArrowColor Deep${CURSOR}SkyBlue\n@enduml`)?.contents[0]).toContain("#00bfff");
    expect(at(`@startuml\nskinparam backgroundColor #FE${CURSOR}FEFE\n@enduml`)?.contents[0]).toContain("#fefefe");
    // A participant that happens to be called Red is not a colour.
    expect(at(`@startuml\nRe${CURSOR}d -> Blue\n@enduml`)?.contents[1]).toContain("**participant**");
  });

  it("stays silent in comments, labels and note bodies", () => {
    expect(at(`@startuml\n' partici${CURSOR}pant\n@enduml`)).toBeUndefined();
    expect(at(`@startuml\nA -> B : act${CURSOR}ivate now\n@enduml`)).toBeUndefined();
    expect(at(`@startuml\nA -> B\nnote left\n  partici${CURSOR}pant\nend note\n@enduml`)).toBeUndefined();
    expect(at(`some pro${CURSOR}se`)).toBeUndefined();
  });
});

describe("signature help", () => {
  const at = (source: string) => {
    const { analysis, line, column } = withCursor(source);
    return signatureHelp(analysis, line, column);
  };

  it("tracks the active parameter of a user procedure call", () => {
    const source = (call: string) => `@startuml\n!procedure $send($from, $to, $label="ping")\n!endprocedure\n${call}\n@enduml`;
    expect(at(source(`$send(${CURSOR}`))).toMatchObject({ label: '$send($from, $to, $label = "ping")', activeParameter: 0 });
    expect(at(source(`$send(Alice, ${CURSOR}`))?.activeParameter).toBe(1);
    expect(at(source(`$send(Alice, "a, b", ${CURSOR}`))?.activeParameter).toBe(2);
    expect(at(source(`$send(Alice, "a, ${CURSOR}`))?.activeParameter).toBe(1);
    const help = at(source(`$send(Alice, ${CURSOR}`));
    expect(help && help.label.slice(...help.parameters[1].label)).toBe("$to");
  });

  it("covers !function, !define macros and nested calls", () => {
    expect(at(`@startuml\n!function $double($x)\n!return $x * 2\n!endfunction\nA -> B : $double(${CURSOR}\n@enduml`)?.label).toBe("$double($x)");
    expect(at(`@startuml\n!define BOX(name, color) participant name color\nBOX(Alice, ${CURSOR}\n@enduml`)).toMatchObject({ label: "BOX(name, color)", activeParameter: 1 });
    const nested = at(`@startuml\n!$n = %substr(%upper(${CURSOR}\n@enduml`);
    expect(nested?.label).toBe("%upper(text)");
  });

  it("covers builtin functions, including variadic ones", () => {
    expect(at(`@startuml\n!$n = %substr("abc", 1, ${CURSOR}\n@enduml`)).toMatchObject({ label: "%substr(text, start, length?)", activeParameter: 2 });
    expect(at(`@startuml\n!$n = %call_user_func("f", 1, 2, ${CURSOR}\n@enduml`)).toMatchObject({ activeParameter: 1 });
  });

  it("is silent outside calls, on definitions and in comments", () => {
    expect(at(`@startuml\nA -> B : hello (${CURSOR}\n@enduml`)).toBeUndefined();
    expect(at(`@startuml\n!procedure $send(${CURSOR}\n@enduml`)).toBeUndefined();
    expect(at(`@startuml\n' %strlen(${CURSOR}\n@enduml`)).toBeUndefined();
    expect(at(`@startuml\n!$n = %strlen("x")${CURSOR}\n@enduml`)).toBeUndefined();
  });
});

describe("robustness while typing", () => {
  it("never throws on any prefix of a corpus document, at any cursor position tried", () => {
    const dir = path.join(__dirname, "corpus");
    let positions = 0;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml"))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const step = Math.max(7, Math.floor(text.length / 24));
      for (let cut = 1; cut <= text.length; cut += step) {
        const partial = text.slice(0, cut);
        const analysis = analyze(partial);
        const line = analysis.lines.length - 1;
        const column = analysis.lines[line].length;
        for (const [l, c] of [[line, column], [Math.max(0, line - 1), 3], [Math.floor(line / 2), 1]] as const) {
          complete(analysis, l, c);
          complete(analysis, l, c, { trigger: " " });
          hover(analysis, l, c);
          signatureHelp(analysis, l, c);
          prepareRename(analysis, l, c);
          rename(analysis, l, c, "new name");
          highlights(analysis, l, c);
          positions++;
        }
        semanticTokens(analysis);
        documentSymbols(analysis);
      }
    }
    expect(positions).toBeGreaterThan(3000);
  });
});

describe("performance", () => {
  it("analyses a 2,000-line document well under 50 ms once warm", () => {
    const dir = path.join(__dirname, "corpus");
    let text = "";
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml")).sort()) text += fs.readFileSync(path.join(dir, file), "utf8") + "\n";
    while (text.split("\n").length < 2000) text += text;
    text = text.split("\n").slice(0, 2000).join("\n");
    for (let i = 0; i < 5; i++) analyze(text);
    const runs = 20;
    const started = performance.now();
    let analysis = analyze(text);
    for (let i = 1; i < runs; i++) analysis = analyze(text);
    const perRun = (performance.now() - started) / runs;
    expect(analysis.lines).toHaveLength(2000);
    expect(analysis.symbols.length).toBeGreaterThan(300);
    // Typically 4-8 ms; the bound is generous so a loaded CI machine does not flake.
    expect(perRun).toBeLessThan(50);
    const tokensStarted = performance.now();
    semanticTokens(analysis);
    documentSymbols(analysis);
    expect(performance.now() - tokensStarted).toBeLessThan(50);
  });
});
