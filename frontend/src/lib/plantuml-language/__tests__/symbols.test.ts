import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyze } from "../core/analysis";
import { corpus, linesOf, names, occurrenceText, sym } from "./intelligence-helpers";

describe("symbol index: every occurrence range covers exactly the name", () => {
  const dir = path.join(__dirname, "corpus");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".puml")).sort()) {
    it(file, () => {
      const analysis = analyze(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const symbol of analysis.symbols) {
        if (symbol.category === "structure") continue;
        for (const occ of symbol.occurrences) {
          const mode = analysis.lineInfo[occ.line].mode;
          // Preprocessor names are substituted inside free text too; diagram names never are.
          if (symbol.block >= 0) expect(["code", "members"], `${symbol.name} on line ${occ.line + 1}`).toContain(mode);
          expect(mode).not.toBe("comment");
          const text = occurrenceText(analysis, occ);
          if (occ.role === "label") expect(text).toBe(symbol.label);
          else if (symbol.keyword === "resource" || symbol.block < 0) expect(text.replace(/^\$/, "")).toBe(symbol.name.replace(/^\$/, ""));
          else expect(symbol.name.endsWith(text), `${symbol.name} vs "${text}" on line ${occ.line + 1}`).toBe(true);
        }
      }
    });
  }
});

describe("sequence diagrams", () => {
  const analysis = analyze(corpus("intel-sequence-participants.puml"));

  it("indexes all eight participant keywords with aliases", () => {
    expect(names(analysis).slice(0, 9)).toEqual(["Browser", "User", "Gateway", "Router", "Order", "DB", "Workers", "Jobs", "Late"]);
    expect(analysis.symbols.slice(0, 9).map((s) => s.keyword)).toEqual([
      "participant", "actor", "boundary", "control", "entity", "database", "collections", "queue", "participant",
    ]);
    const browser = sym(analysis, "Browser");
    expect(browser.label).toBe("Web Browser");
    expect(browser.declaration).toMatchObject({ line: 2, startColumn: 29, endColumn: 36, role: "declaration" });
    expect(linesOf(browser, "label")).toEqual([3]);
  });

  it("resolves references in messages, activation, notes and ref", () => {
    const browser = sym(analysis, "Browser");
    expect(linesOf(browser)).toEqual([17, 18, 27, 28, 37, 39, 41]);
    expect(linesOf(sym(analysis, "Order"))).toEqual([20, 21, 22, 23, 24, 26]);
    expect(linesOf(sym(analysis, "Gateway"))).toEqual([18, 19, 27, 29, 41]);
  });

  it("declares participants implicitly on first use, quoted or not", () => {
    const implicit = sym(analysis, "Implicit");
    expect(implicit.implicit).toBe(true);
    expect(implicit.keyword).toBe("participant");
    expect(implicit.declaration.line).toBe(31);
    const quoted = sym(analysis, "Quoted Name");
    expect(quoted.declaration.delimiter).toBe('"');
  });

  it("ignores names that only appear in note bodies and labels", () => {
    // Line 30 is a note body containing "Browser -> Gateway".
    expect(analysis.lineInfo[29].mode).toBe("text");
    expect(analysis.occurrencesByLine.get(29)).toBeUndefined();
  });

  it("nests participants in their box and records groups for the outline", () => {
    const box = analysis.symbols.find((s) => s.keyword === "box");
    expect(box?.name).toBe("Internal");
    expect(sym(analysis, "Cache").parent).toBe(box?.id);
    const alt = analysis.symbols.find((s) => s.keyword === "alt");
    expect(alt?.name).toBe("alt success");
    expect(alt?.range).toMatchObject({ startLine: 35, endLine: 39 });
    expect(analysis.symbols.find((s) => s.keyword === "divider")?.name).toBe("Done");
  });

  it("treats delays, spacing and dividers as text", () => {
    const a = analyze("@startuml\nAlice -> Bob\n... 5 minutes later ...\n|||\n||45||\n== Phase 2 -- later ==\nBob --> Alice\n@enduml");
    expect(names(a)).toEqual(["Alice", "Bob"]);
  });

  it("does not nest participants under alt/loop groups", () => {
    const a = analyze("@startuml\nalt ok\n  Alice -> Bob\nend\n@enduml");
    expect(sym(a, "Alice").parent).toBeUndefined();
  });

  it("keeps keyword-named participants apart from the keywords", () => {
    const a = analyze(corpus("sequence-keyword-named-participants.puml"));
    expect(names(a)).toEqual(["order", "state", "memo", "database", "queue", "actor"]);
    expect(linesOf(sym(a, "order"))).toEqual([6, 7, 10, 11]);
  });

  it("lets a later declaration take over from an implicit first use", () => {
    const a = analyze("@startuml\nAlice -> Bob\nparticipant Bob\n@enduml");
    const bob = sym(a, "Bob");
    expect(bob.implicit).toBe(false);
    expect(bob.declaration.line).toBe(2);
    expect(linesOf(bob)).toEqual([2]);
  });

  it("handles `Name as Alias` and `Alias as \"Label\"`", () => {
    const a = analyze('@startuml\nparticipant Bob as B\nparticipant C as "Carol Long"\nB -> C\n@enduml');
    expect(sym(a, "B").label).toBe("Bob");
    expect(sym(a, "C").label).toBe("Carol Long");
    expect(linesOf(sym(a, "C"))).toEqual([4]);
  });
});

describe("class diagrams", () => {
  const analysis = analyze(corpus("intel-class-full.puml"));

  it("indexes the class family with their keywords and categories", () => {
    const kinds = Object.fromEntries(analysis.symbols.filter((s) => s.category === "class" || s.category === "type").map((s) => [s.name, s.keyword]));
    expect(kinds).toEqual({
      Shape: "abstract class", Drawable: "interface", Color: "enum", Circle: "class", RSquare: "class", Marker: "annotation",
      Point: "struct", ShapeError: "exception", Helper: "class", Record: "entity",
    });
    expect(sym(analysis, "RSquare").label).toBe("Rounded Square");
  });

  it("does not mistake generic parameters for names", () => {
    expect(names(analysis)).not.toContain("Number");
    expect(names(analysis)).not.toContain("T");
  });

  it("records extends / implements, relations and notes as references", () => {
    expect(linesOf(sym(analysis, "Shape"))).toEqual([16, 31, 38]);
    expect(linesOf(sym(analysis, "Drawable"))).toEqual([16]);
    expect(linesOf(sym(analysis, "Circle"))).toEqual([32, 33, 35, 36, 39, 40]);
    expect(linesOf(sym(analysis, "N1"))).toEqual([38]);
  });

  it("nests types in packages/namespaces and members in types", () => {
    const domain = sym(analysis, "domain");
    expect(domain.category).toBe("container");
    expect(domain.label).toBe("Domain Model");
    expect(sym(analysis, "Shape").parent).toBe(domain.id);
    expect(sym(analysis, "Helper").parent).toBe(sym(analysis, "util").id);
    const members = (owner: string) => sym(analysis, owner).children.map((id) => `${analysis.symbols[id].keyword} ${analysis.symbols[id].name}`);
    expect(members("Shape")).toEqual(["method area", "field name", "field count"]);
    expect(members("Color")).toEqual(["enum constant RED", "enum constant GREEN", "enum constant BLUE"]);
    expect(members("Circle")).toEqual(["field radius", "method scale"]);
  });

  it("resolves namespace-qualified references to the class and the namespace", () => {
    expect(linesOf(sym(analysis, "Helper"))).toEqual([35]);
    expect(linesOf(sym(analysis, "util"))).toEqual([35]);
  });

  it("collects stereotypes", () => {
    expect(analysis.stereotypes).toEqual(["Serializable", "uses"]);
  });

  it("keeps a package and a class of the same name apart", () => {
    const a = analyze(corpus("template-class-with-packages.puml"));
    const both = a.symbols.filter((s) => s.name === "Repository");
    expect(both.map((s) => s.keyword).sort()).toEqual(["interface", "package"]);
  });

  it("indexes objects, maps and json", () => {
    const a = analyze(corpus("intel-object-map-json.puml"));
    expect(names(a).filter((n) => ["user", "cart", "CapitalCity", "Config"].includes(n))).toEqual(["user", "cart", "CapitalCity", "Config"]);
    expect(sym(a, "cart").label).toBe("Shopping Cart");
    expect(sym(a, "CapitalCity").children.map((id) => a.symbols[id].name)).toEqual(["UK", "USA"]);
    expect(linesOf(sym(a, "cart"))).toEqual([15, 16, 17]);
  });

  it("indexes ER entities with their fields", () => {
    const a = analyze(corpus("intel-er-entity.puml"));
    expect(sym(a, "cust").label).toBe("Customer");
    expect(sym(a, "Order").children.map((id) => a.symbols[id].name)).toEqual(["id", "customer_id"]);
    expect(linesOf(sym(a, "item"))).toEqual([16]);
  });
});

describe("state diagrams", () => {
  const analysis = analyze(corpus("intel-state-nested.puml"));

  it("indexes declared, aliased and implicit states, never [*]", () => {
    expect(names(analysis)).toEqual(["Idle", "Processing", "Validating", "Charging", "Pending", "Captured", "Choice", "fork1", "Done", "Failed"]);
    expect(sym(analysis, "Processing").label).toBe("Processing Order");
    expect(sym(analysis, "Idle").implicit).toBe(true);
  });

  it("nests states and extends composite ranges over their body", () => {
    const processing = sym(analysis, "Processing");
    expect(processing.range).toMatchObject({ startLine: 2, endLine: 10 });
    expect(sym(analysis, "Charging").parent).toBe(processing.id);
    expect(sym(analysis, "Pending").parent).toBe(sym(analysis, "Charging").id);
  });

  it("records transitions, descriptions and notes", () => {
    expect(linesOf(sym(analysis, "Idle"))).toEqual([14, 18, 21]);
    // `state Done #LightGreen` comes after the first use and becomes the declaration.
    expect(sym(analysis, "Done").declaration.line).toBe(21);
    expect(linesOf(sym(analysis, "Done"))).toEqual([16, 19]);
  });
});

describe("use case, component and deployment diagrams", () => {
  it("indexes actors and use cases in every notation", () => {
    const a = analyze(corpus("intel-usecase.puml"));
    expect(sym(a, "Clerk")).toMatchObject({ keyword: "actor", label: "Bank Clerk" });
    expect(sym(a, "Admin")).toMatchObject({ keyword: "actor", label: "Admin User" });
    expect(sym(a, "UC1")).toMatchObject({ keyword: "usecase", label: "Open Account" });
    expect(sym(a, "UC3")).toMatchObject({ keyword: "usecase", label: "Deposit Money" });
    const withdraw = sym(a, "Withdraw");
    expect(withdraw.declaration.delimiter).toBe("(");
    expect(linesOf(withdraw)).toEqual([17, 20]);
    expect(sym(a, "UC1").parent).toBe(sym(a, "Bank").id);
    expect(linesOf(sym(a, "UC1"))).toEqual([15, 19, 22, 23]);
  });

  it("indexes components, interfaces and nested deployment elements", () => {
    const a = analyze(corpus("intel-component.puml"));
    expect(sym(a, "Web")).toMatchObject({ keyword: "component", label: "Web App" });
    expect(sym(a, "Mobile App").declaration.delimiter).toBe("[");
    expect(sym(a, "API")).toMatchObject({ keyword: "interface", label: "REST API" });
    expect(sym(a, "GQL")).toMatchObject({ keyword: "interface", label: "GraphQL" });
    expect(sym(a, "Backend").parent).toBe(sym(a, "Server").id);
    expect(sym(a, "p1")).toMatchObject({ keyword: "port", parent: sym(a, "Backend").id });
    expect(sym(a, "Users").parent).toBe(sym(a, "Schemas").id);
    expect(linesOf(sym(a, "Mobile App"))).toEqual([24]);
    expect(linesOf(sym(a, "Web"))).toEqual([23, 29, 30]);
  });

  it("indexes every deployment element type", () => {
    const a = analyze(corpus("intel-deployment.puml"));
    const legacy = sym(a, "Legacy");
    expect(legacy.children.map((id) => a.symbols[id].keyword)).toEqual([
      "card", "file", "stack", "hexagon", "person", "process", "label", "collections", "boundary", "control", "entity",
      "interface", "rectangle", "folder", "queue", "usecase", "action",
    ]);
    expect(linesOf(sym(a, "war"))).toEqual([32, 34]);
    expect(linesOf(sym(a, "db_host"))).toEqual([36]);
  });
});

describe("activity diagrams", () => {
  it("indexes swimlanes as renameable names and control structures for the outline", () => {
    const a = analyze(corpus("intel-activity-new.puml"));
    const customer = sym(a, "Customer");
    expect(customer.keyword).toBe("swimlane");
    expect(linesOf(customer)).toEqual([35]);
    expect(sym(a, "Warehouse").declaration).toMatchObject({ line: 4, startColumn: 12, endColumn: 21 });
    const structure = a.symbols.filter((s) => s.category === "structure").map((s) => s.name);
    expect(structure).toEqual(["Fulfilment", "if In stock?", "fork", "while More parcels?", "repeat", "switch Result?"]);
    // Activity labels are text: nothing inside `:...;` is a symbol.
    expect(names(a)).toEqual(["Customer", "Warehouse"]);
  });

  it("skips multi-line legacy activity text and note terminators", () => {
    const a = analyze(corpus("authoring-activity-legacy-nested.puml"));
    expect(names(a)).toEqual(["Check input", "Process", "Merge", "Handle directly", "Store", "Reject", "Compress"]);
    expect(linesOf(sym(a, "Compress"))).toEqual([22, 24]);
  });

  it("indexes legacy activities, their aliases and references", () => {
    const a = analyze(corpus("intel-activity-legacy.puml"));
    expect(names(a)).toEqual(["First Activity", "A2", "Some Action", "Another Action", "Something else"]);
    expect(sym(a, "A2").label).toBe("Second Activity");
    expect(linesOf(sym(a, "A2"))).toEqual([12]);
    expect(linesOf(sym(a, "First Activity"))).toEqual([3]);
  });
});

describe("timing, Gantt, nwdiag, Chen, trees", () => {
  it("indexes timing participants and their uses", () => {
    const a = analyze(corpus("intel-timing.puml"));
    expect(a.symbols.map((s) => `${s.keyword} ${s.name}`)).toEqual(["robust WB", "concise WU", "clock clk", "binary EN", "analog V"]);
    expect(linesOf(sym(a, "WU"))).toEqual([9, 14, 15, 22]);
    expect(linesOf(sym(a, "WB"))).toEqual([10, 14, 16, 21]);
  });

  it("indexes Gantt tasks, aliases, milestones and resources", () => {
    const a = analyze(corpus("intel-gantt.puml"));
    expect(sym(a, "D")).toMatchObject({ keyword: "task", label: "Design phase" });
    expect(linesOf(sym(a, "B"))).toEqual([8, 10, 16, 17]);
    expect(sym(a, "Release").keyword).toBe("milestone");
    expect(sym(a, "Alice").keyword).toBe("resource");
    expect(linesOf(sym(a, "Alice"))).toEqual([18]);
    expect(a.symbols.find((s) => s.keyword === "separator")?.name).toBe("Phase two");
  });

  it("indexes nwdiag networks and nodes, inline and with its own tag", () => {
    const a = analyze(corpus("intel-nwdiag.puml"));
    expect(sym(a, "dmz").keyword).toBe("network");
    expect(sym(a, "web01").parent).toBe(sym(a, "dmz").id);
    expect(linesOf(sym(a, "web01"))).toEqual([10, 15, 19]);
    expect(names(analyze(corpus("intel-nwdiag-tag.puml")))).toEqual(["office", "pc1", "printer"]);
  });

  it("indexes Chen entities, attributes and relationships", () => {
    const a = analyze(corpus("intel-chen.puml"));
    expect(sym(a, "DIRECTOR").children.map((id) => a.symbols[id].name)).toEqual(["Number", "Name", "Fname", "Lname", "Age"]);
    expect(sym(a, "DIRECTS").keyword).toBe("relationship");
    expect(linesOf(sym(a, "DIRECTS"))).toEqual([15, 16]);
  });

  it("builds the mindmap and WBS trees", () => {
    const a = analyze(corpus("intel-mindmap.puml"));
    const tree = (id: number, depth = 0): string[] => [
      `${"  ".repeat(depth)}${a.symbols[id].name}`,
      ...a.symbols[id].children.flatMap((child) => tree(child, depth + 1)),
    ];
    expect(tree(0)).toEqual([
      "Project", "  Planning", "    Goals", "    Budget", "  Execution", "    boxless leaf", "  Review", "  Risks", "    Schedule",
      "  Team", "  Plus side",
    ]);
    const wbs = analyze(corpus("intel-wbs.puml"));
    expect(wbs.symbols.filter((s) => s.parent === 0).map((s) => s.name)).toEqual(["Launch", "Design phase", "Complete"]);
  });
});

describe("preprocessor symbols", () => {
  const analysis = analyze(corpus("intel-preproc.puml"));

  it("indexes variables, macros, procedures and functions document-wide", () => {
    const pre = analysis.symbols.filter((s) => s.block === -1 && s.category !== "parameter").map((s) => `${s.keyword} ${s.detail ?? s.name}`);
    expect(pre).toEqual([
      'variable "#LightBlue"', "variable 3", "!define SIMPLE_MACRO(x)", "!definelong LONG_MACRO(a, b)", "!procedure $send($from, $to, $label)",
      "!function $double($x)", "variable $x * 2", "!procedure $box($name)", "variable loop variable",
    ]);
    expect(sym(analysis, "$send").parameters).toEqual([{ name: "$from" }, { name: "$to" }, { name: "$label", defaultValue: '"ping"' }]);
  });

  it("finds calls and uses, including inside message labels", () => {
    expect(linesOf(sym(analysis, "$send"))).toEqual([20, 21]);
    expect(linesOf(sym(analysis, "SIMPLE_MACRO"))).toEqual([18]);
    expect(linesOf(sym(analysis, "$count"))).toEqual([23]);
    expect(linesOf(sym(analysis, "$primary"))).toEqual([23]);
    expect(linesOf(sym(analysis, "$i"))).toEqual([28]);
  });

  it("scopes parameters to their body and keeps them out of the diagram's symbols", () => {
    expect(linesOf(sym(analysis, "$from"))).toEqual([9]);
    expect(linesOf(sym(analysis, "a"))).toEqual([6]);
    expect(names(analysis, 0)).toEqual(["Alice", "Bob"]);
  });

  it("handles one-line functions, unquoted parameters and one-line !define bodies", () => {
    const a = analyze(
      [
        "@startuml",
        "!function $inc($x) !return $x + 1",
        "!unquoted procedure $say(from, to, text)",
        "  from -> to : text",
        "!endprocedure",
        "!define TABLE(name) database name <<table>>",
        "$say(Alice, Bob, hi)",
        "Alice -> Bob : $inc(1)",
        "@enduml",
      ].join("\n"),
    );
    expect(names(a, 0)).toEqual(["Alice", "Bob"]);
    const param = (owner: string, name: string) => a.symbols.find((s) => s.name === name && s.parent === sym(a, owner).id);
    expect(param("$inc", "$x")?.occurrences.map((o) => [o.line + 1, o.startColumn])).toEqual([[2, 15], [2, 27]]);
    expect(param("$say", "from")?.occurrences.map((o) => o.line + 1)).toEqual([3, 4]);
    expect(param("$say", "text")?.occurrences.map((o) => o.line + 1)).toEqual([3, 4]);
    expect(param("TABLE", "name")?.occurrences.map((o) => [o.line + 1, o.startColumn])).toEqual([[6, 14], [6, 29]]);
    expect(linesOf(sym(a, "$inc"))).toEqual([8]);
  });

  it("is visible from every block of the document", () => {
    const a = analyze("@startuml\n!$color = \"red\"\nA -> B\n@enduml\n@startuml\nclass C #$color\n@enduml");
    expect(linesOf(sym(a, "$color"))).toEqual([6]);
  });
});

describe("scoping", () => {
  it("keeps the same name in different blocks apart", () => {
    const a = analyze(corpus("intel-multi-block.puml"));
    expect(a.symbols.filter((s) => s.name === "Alice").map((s) => [s.block, s.keyword])).toEqual([[0, "participant"], [1, "class"], [2, "node"]]);
    expect(linesOf(sym(a, "Alice", 0))).toEqual([4]);
    expect(linesOf(sym(a, "Alice", 1))).toEqual([10]);
  });

  it("indexes an unfinished document without throwing", () => {
    const a = analyze("@startuml\nclass A {\n  +x\n}\nA --> \nnote left of");
    expect(a.blocks[0].closed).toBe(false);
    expect(sym(a, "A").keyword).toBe("class");
    expect(linesOf(sym(a, "A"))).toEqual([5]);
    // An unclosed class body swallows what follows as members rather than failing.
    expect(analyze("@startuml\nclass B {\n  +x\nB --> C").symbols.map((s) => s.category)).toEqual(["class", "member", "member"]);
  });

  it("returns nothing for data blocks", () => {
    for (const file of ["intel-yaml.puml", "template-json-visualization.puml", "template-wireframe-salt.puml", "intel-ditaa.puml", "intel-math.puml"]) {
      expect(analyze(corpus(file)).symbols, file).toEqual([]);
    }
  });
});
