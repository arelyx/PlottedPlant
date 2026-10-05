import { describe, expect, it } from "vitest";
import { colorHex, colorNames, documentColors, isColorName } from "../core/colors";
import { analyzeStructure } from "../core/structure";
import { vocab } from "../vocab";

/** `text=#hex` for every colour found, in order; unknown names show as `text=?`. */
const colors = (source: string) => {
  const lines = source.split("\n");
  return documentColors(lines, analyzeStructure(lines)).map(
    (t) => `${t.text}=${t.hex ?? "?"}${t.alpha < 1 ? `@${t.alpha.toFixed(2)}` : ""}`,
  );
};
const uml = (body: string) => colors(`@startuml\n${body}\n@enduml`);

describe("colour table", () => {
  it("has a value for every colour name the engine lists", () => {
    expect(colorNames).toHaveLength(vocab.colors.length);
    for (const name of vocab.colors) expect(colorHex(name), name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("looks names up case-insensitively, with or without #", () => {
    expect(colorHex("LightBlue")).toBe("#add8e6");
    expect(colorHex("#LIGHTBLUE")).toBe("#add8e6");
    expect(colorHex("red")).toBe("#ff0000");
    expect(colorHex("Application")).toBe("#c2f0ff");
    expect(colorHex("nope")).toBeUndefined();
    expect(colorHex("#ff0000")).toBeUndefined();
    expect(isColorName("darkorange")).toBe(true);
    expect(isColorName("transparent")).toBe(false);
  });
});

describe("colours in colour positions", () => {
  it("element, group and note colours", () => {
    expect(uml('participant A #FF0000\nactor B #lightblue\nbox "x" #EEE\nend box\nalt #LightGreen ok\nend\nnote over A #aqua: hi')).toEqual([
      "#FF0000=#ff0000",
      "#lightblue=#add8e6",
      "#EEE=#eeeeee",
      "#LightGreen=#90ee90",
      "#aqua=#00ffff",
    ]);
  });

  it("three, six and eight digit hex, with alpha", () => {
    expect(uml("class A #abc\nclass B #AABBCC\nclass C #ff000080")).toEqual(["#abc=#aabbcc", "#AABBCC=#aabbcc", "#ff000080=#ff0000@0.50"]);
  });

  it("arrow, gradient, border and inline-style colours", () => {
    expect(uml("A -[#red]-> B\nA -[#0000FF,dashed]-> C\nclass D #red/blue\nclass E #white|DDD\nclass F ##[dashed]green\nclass G #back:Wheat;line:333;text:navy;line.bold")).toEqual([
      "#red=#ff0000",
      "#0000FF=#0000ff",
      "#red=#ff0000",
      "blue=#0000ff",
      "#white=#ffffff",
      "DDD=#dddddd",
      "green=#008000",
      "Wheat=#f5deb3",
      "333=#333333",
      "navy=#000080",
    ]);
  });

  it("marks the positions where the engine takes a colour without #", () => {
    const lines = "@startuml\nclass D #red/blue\nclass F ##[dashed]green\nclass G #back:Wheat;line:333\nskinparam classBackgroundColor #white/#DDD\n@enduml".split("\n");
    expect(documentColors(lines, analyzeStructure(lines)).map((t) => `${t.text}:${t.bare}`)).toEqual([
      "#red:false",
      "blue:true",
      "green:true",
      "Wheat:true",
      "333:true",
      "#white:false",
      "#DDD:false",
    ]);
  });

  it("stereotype spots and activity colours", () => {
    expect(uml("class S << (S,#FF7700) Singleton >>")).toEqual(["#FF7700=#ff7700"]);
    expect(uml("start\n#HotPink:step;\n#palegreen:if (x) then\nendif\nstop")).toEqual(["#HotPink=#ff69b4", "#palegreen=#98fb98"]);
  });

  it("skinparam and style values, named or hex, only for colour properties", () => {
    expect(
      uml("skinparam backgroundColor #EEEBDC\nskinparam ArrowColor DeepSkyBlue\nskinparam defaultFontName Aqua\nskinparam class {\n  BackgroundColor<<E>> Wheat\n  BorderThickness 2\n  FontColor #111\n}\n<style>\nnote {\n  BackgroundColor gold\n  LineColor #ff0000;\n  FontSize 12\n}\n</style>"),
    ).toEqual(["#EEEBDC=#eeebdc", "DeepSkyBlue=#00bfff", "Wheat=#f5deb3", "#111=#111111", "gold=#ffd700", "#ff0000=#ff0000"]);
  });

  it("creole colour tags, also inside note bodies", () => {
    expect(uml('A -> B : <color:red>hot</color> <back:#FFFF00>lit</back>\nnote left\n  <color #0000FF>blue</color>\n  <font color="green">g</font>\nend note')).toEqual([
      "red=#ff0000",
      "#FFFF00=#ffff00",
      "#0000FF=#0000ff",
      "green=#008000",
    ]);
  });

  it("quoted hex values in macro arguments and variables", () => {
    expect(uml('!$accent = "#1E90FF"\nAddElementTag("v1", $bgColor="#d73027")')).toEqual(["#1E90FF=#1e90ff", "#d73027=#d73027"]);
  });

  it("mindmap node colours, Gantt colours and nwdiag attributes", () => {
    expect(colors("@startmindmap\n*[#Orange] root\n**[#lightgreen] a\n** issue #123\n@endmindmap")).toEqual(["#Orange=#ffa500", "#lightgreen=#90ee90"]);
    expect(colors("@startgantt\n[Task] lasts 3 days and is colored in Fuchsia/FireBrick\n@endgantt")).toEqual(["Fuchsia=#ff00ff", "FireBrick=#b22222"]);
    expect(colors('@startnwdiag\nnwdiag {\n  network dmz {\n    color = "#FFAAAA"\n    web [color = "pink"];\n  }\n}\n@endnwdiag')).toEqual([
      "#FFAAAA=#ffaaaa",
      "pink=#ffc0cb",
    ]);
  });

  it("reports an unknown name only where a colour is certain to be meant", () => {
    expect(uml("participant A #notacolor\nA -[#nope]-> B\nskinparam BackgroundColor Blurple\nA -> B : <color:blurple>x</color>")).toEqual([
      "#notacolor=?",
      "#nope=?",
      "Blurple=?",
      "blurple=?",
    ]);
    expect(uml("A -> B #notacolor : label")).toEqual([]);
  });
});

describe("# that is not a colour", () => {
  it.each<[string, string]>([
    ["member visibility after a colon", "class A\nA : #protectedField\nA : #fab()"],
    ["member visibility in a class body", "class A {\n  #secret\n  #add()\n  #fff: int\n}"],
    ["message text", "A -> B : fix #123 and #abc, see #red"],
    ["a link with a fragment", "A -> B\nurl of A is [[http://example.com/page#abc]]\nclass C [[http://example.com#fff]]"],
    ["titles, dividers and other free text", "title Release #123\n== Phase #2 ==\nheader build #abc\ncaption fig #1\nA -> B"],
    ["note bodies and comments", "A -> B\nnote left\n  # heading\n  #123 and #red\nend note\n' #FF0000 in a comment\n/' #00FF00\n   #0000FF '/"],
    ["quoted names", 'participant "#1 fan" as F\nparticipant "#red" as R'],
    ["special colours and variables", "participant A #transparent\nparticipant B #$brand\nparticipant C #%lighten(\"red\", 20)"],
    ["hex of the wrong length", "participant A #12345\nparticipant B #1234567"],
    ["text in unparsed dialects", "@enduml\n@startyaml\ncolor: \"#ff0000\"\ntag: #abc\n@endyaml\n@startuml"],
  ])("%s", (_name, body) => {
    expect(uml(body)).toEqual([]);
  });
});
