import { type DocRecord, LINKS } from "./docs-model";

// <style> selectors and properties. Selectors named after an element keyword
// (class, note, title, participant ...) are not registered here: hovering those
// words must explain the element, and the generated skinparam entries already
// name the matching selector.

const styleBlock = (rules: string, host: string) => `<style>\n${rules}\n</style>\n${host}`;

interface DiagramSelector {
  selector: string;
  diagrams: string;
  rules: string;
  host: string;
  tag?: string;
}

const DIAGRAM_SELECTORS: DiagramSelector[] = [
  {
    selector: "sequenceDiagram",
    diagrams: "sequence diagrams",
    rules: "sequenceDiagram {\n  participant {\n    BackGroundColor LightBlue\n  }\n}",
    host: "Alice -> Bob: hello",
  },
  {
    selector: "classDiagram",
    diagrams: "class diagrams",
    rules: "classDiagram {\n  class {\n    BackGroundColor LightYellow\n    LineColor DarkBlue\n  }\n}",
    host: "class Account",
  },
  {
    selector: "objectDiagram",
    diagrams: "object diagrams",
    rules: "objectDiagram {\n  object {\n    BackGroundColor LightYellow\n  }\n}",
    host: "object order",
  },
  {
    selector: "componentDiagram",
    diagrams: "component, deployment and use case diagrams",
    rules: "componentDiagram {\n  component {\n    BackGroundColor LightBlue\n  }\n}",
    host: "[Billing] --> [Ledger]",
  },
  {
    selector: "activityDiagram",
    diagrams: "activity diagrams",
    rules: "activityDiagram {\n  activity {\n    BackGroundColor LightGreen\n  }\n  diamond {\n    BackGroundColor LightYellow\n  }\n}",
    host: "start\nif (Paid?) then (yes)\n  :Ship order;\nendif\nstop",
  },
  {
    selector: "stateDiagram",
    diagrams: "state diagrams",
    rules: "stateDiagram {\n  state {\n    BackGroundColor LightBlue\n  }\n}",
    host: "[*] --> Active",
  },
  {
    selector: "timingDiagram",
    diagrams: "timing diagrams",
    rules: "timingDiagram {\n  robust {\n    LineColor DarkBlue\n  }\n}",
    host: 'robust "Server" as S\n@0\nS is Idle\n@10\nS is Busy',
  },
  {
    selector: "ganttDiagram",
    diagrams: "Gantt charts",
    rules: "ganttDiagram {\n  task {\n    BackGroundColor LightGreen\n  }\n  milestone {\n    BackGroundColor Crimson\n  }\n}",
    host: "[Design] lasts 5 days\n[Review] happens at [Design]'s end",
    tag: "gantt",
  },
  {
    selector: "mindmapDiagram",
    diagrams: "mind maps",
    rules: "mindmapDiagram {\n  node {\n    BackGroundColor LightBlue\n  }\n  :depth(1) {\n    BackGroundColor LightGreen\n  }\n}",
    host: "* Project\n** Scope\n** Team",
    tag: "mindmap",
  },
  {
    selector: "wbsDiagram",
    diagrams: "work breakdown structures",
    rules: "wbsDiagram {\n  node {\n    BackGroundColor LightBlue\n  }\n}",
    host: "* Project\n** Design\n** Build",
    tag: "wbs",
  },
  {
    selector: "jsonDiagram",
    diagrams: "JSON diagrams",
    rules: "jsonDiagram {\n  node {\n    BackGroundColor LightYellow\n  }\n  highlight {\n    BackGroundColor Gold\n  }\n}",
    host: '#highlight "name"\n{\n  "name": "Ada",\n  "role": "admin"\n}',
    tag: "json",
  },
  {
    selector: "yamlDiagram",
    diagrams: "YAML diagrams",
    rules: "yamlDiagram {\n  node {\n    BackGroundColor LightYellow\n  }\n}",
    host: "name: Ada\nrole: admin",
    tag: "yaml",
  },
  {
    selector: "nwdiagDiagram",
    diagrams: "network diagrams",
    rules: "nwdiagDiagram {\n  network {\n    BackGroundColor LightBlue\n  }\n  server {\n    BackGroundColor LightYellow\n  }\n}",
    host: 'nwdiag {\n  network dmz {\n    address = "10.0.0.0/24"\n    web01;\n  }\n}',
    tag: "nwdiag",
  },
  {
    selector: "saltDiagram",
    diagrams: "Salt wireframes",
    rules: "saltDiagram {\n  BackGroundColor WhiteSmoke\n}",
    host: "{\n  Name | \"Ada     \"\n  [Cancel] | [OK]\n}",
    tag: "salt",
  },
];

const diagramSelectorDocs: DocRecord[] = DIAGRAM_SELECTORS.map((d) => ({
  terms: [d.selector],
  signature: `${d.selector} { <selector> { <Property> <value> } }`,
  body: `Style selector that limits the rules nested inside it to ${d.diagrams}. Rules written outside any diagram selector apply to every diagram type, so use this one in shared style files that several diagram types include.`,
  example: styleBlock(d.rules, d.host),
  link: LINKS.style,
  ...(d.tag ? { tag: d.tag } : {}),
}));

const selectorDocs: DocRecord[] = [
  {
    terms: ["<style>", "</style>"],
    signature: "<style> selector { Property value } </style>",
    body: "Opens a block of CSS-like style rules. A rule is a selector followed by `{ }` holding one `Property value` pair per line. Selectors name elements (`class`, `note`, `arrow`), can be nested, and can be limited to one diagram type (`classDiagram { ... }`) or to a stereotype (`.important { ... }`). Style blocks are the newer replacement for `skinparam`, and both can be mixed in one diagram.",
    example: styleBlock("note {\n  BackGroundColor LightYellow\n  FontColor Navy\n}", "Alice -> Bob: hello\nnote right: styled note"),
    link: LINKS.style,
  },
  {
    terms: ["root"],
    signature: "root { <Property> <value> }",
    body: "Style selector for the base values that every other rule inherits, such as the default font, text colour and line colour. Change it to restyle a whole diagram in a few lines.",
    example: styleBlock("root {\n  FontName Courier\n  FontColor DarkSlateGray\n  LineColor DarkSlateGray\n}", "Alice -> Bob: hello"),
    link: LINKS.style,
  },
  {
    terms: ["document"],
    signature: "document { <Property> <value> }",
    body: "Style selector for the page itself. `BackGroundColor` here sets the diagram background. The page-level parts `title`, `header`, `footer`, `legend` and `caption` can be nested inside it.",
    example: styleBlock("document {\n  BackGroundColor WhiteSmoke\n  title {\n    FontSize 20\n  }\n}", "title Checkout\nAlice -> Bob: hello"),
    link: LINKS.style,
  },
  {
    terms: ["element"],
    signature: "element { <Property> <value> }",
    body: "Style selector that matches every drawn element of a diagram: classes, participants, components, states and so on. Use it for settings that should apply to all boxes, such as `RoundCorner` or `LineThickness`.",
    example: styleBlock("element {\n  RoundCorner 10\n  LineThickness 2\n}", "class Order\nclass Customer\nOrder --> Customer"),
    link: LINKS.style,
  },
  {
    terms: ["arrow"],
    signature: "arrow { <Property> <value> }",
    body: "Style selector for arrows and links in every diagram type. `LineColor`, `LineThickness` and `LineStyle` change the line, and the font properties change the label.",
    example: styleBlock("arrow {\n  LineColor DarkBlue\n  LineThickness 2\n  FontColor DarkBlue\n}", "class Order\nclass Customer\nOrder --> Customer : placed by"),
    link: LINKS.style,
  },
  {
    terms: ["lifeLine"],
    kinds: ["sequence"],
    signature: "lifeLine { <Property> <value> }",
    body: "Style selector for the vertical lifelines below sequence participants.",
    example: styleBlock("sequenceDiagram {\n  lifeLine {\n    LineColor DarkBlue\n    LineStyle 4-4\n  }\n}", "Alice -> Bob: hello"),
    link: LINKS.style,
  },
  {
    terms: ["groupHeader"],
    kinds: ["sequence"],
    signature: "groupHeader { <Property> <value> }",
    body: "Style selector for the label tab at the top left of sequence group frames such as `alt`, `loop` and `group`. The frame itself is styled with the `group` selector.",
    example: styleBlock(
      "sequenceDiagram {\n  groupHeader {\n    BackGroundColor LightBlue\n  }\n  group {\n    LineColor DarkBlue\n  }\n}",
      "loop every minute\n  Alice -> Bob: ping\nend",
    ),
    link: LINKS.style,
  },
  {
    terms: ["referenceHeader"],
    kinds: ["sequence"],
    signature: "referenceHeader { <Property> <value> }",
    body: "Style selector for the `ref` label tab of sequence reference frames. The frame body is styled with the `reference` selector.",
    example: styleBlock(
      "sequenceDiagram {\n  referenceHeader {\n    BackGroundColor LightBlue\n  }\n  reference {\n    LineColor DarkBlue\n  }\n}",
      "participant Alice\nparticipant Bob\nref over Alice, Bob: Login sequence",
    ),
    link: LINKS.style,
  },
  {
    terms: [":depth", ":depth(n)"],
    kinds: ["mindmap", "wbs"],
    signature: ":depth(<level>) { <Property> <value> }",
    body: "Style selector for the nodes at one level of a mind map or work breakdown structure. The root is level 0, its children are level 1, and so on. It saves colouring every node by hand.",
    example: styleBlock(
      "mindmapDiagram {\n  :depth(0) {\n    BackGroundColor Gold\n  }\n  :depth(1) {\n    BackGroundColor LightBlue\n  }\n}",
      "* Project\n** Scope\n** Team",
    ),
    link: LINKS.style,
  },
  {
    terms: ["rootNode"],
    kinds: ["mindmap", "wbs"],
    signature: "rootNode { <Property> <value> }",
    body: "Style selector for the root node of a mind map or work breakdown structure.",
    example: styleBlock("mindmapDiagram {\n  rootNode {\n    BackGroundColor Gold\n    FontStyle bold\n  }\n}", "* Project\n** Scope\n** Team"),
    link: LINKS.style,
  },
  {
    terms: ["leafNode"],
    kinds: ["mindmap", "wbs"],
    signature: "leafNode { <Property> <value> }",
    body: "Style selector for the nodes without children in a mind map or work breakdown structure.",
    example: styleBlock("mindmapDiagram {\n  leafNode {\n    BackGroundColor LightGreen\n  }\n}", "* Project\n** Scope\n** Team"),
    link: LINKS.style,
  },
  {
    terms: ["task"],
    kinds: ["gantt"],
    signature: "task { <Property> <value> }",
    body: "Style selector for the task bars of a Gantt chart. The `undone` selector styles the part of a bar that is not completed yet, and `milestone` styles milestones.",
    example: styleBlock(
      "ganttDiagram {\n  task {\n    BackGroundColor LightGreen\n    LineColor DarkGreen\n  }\n  undone {\n    BackGroundColor White\n  }\n}",
      "[Design] lasts 5 days\n[Design] is 40% completed",
    ),
    link: LINKS.style,
  },
  {
    terms: ["milestone"],
    kinds: ["gantt"],
    signature: "milestone { <Property> <value> }",
    body: "Style selector for the diamond that marks a milestone in a Gantt chart.",
    example: styleBlock("ganttDiagram {\n  milestone {\n    BackGroundColor Crimson\n    FontColor Crimson\n  }\n}", "[Design] lasts 5 days\n[Release] happens at [Design]'s end"),
    link: LINKS.style,
  },
  {
    terms: ["timeline"],
    kinds: ["gantt"],
    signature: "timeline { <Property> <value> }",
    body: "Style selector for the calendar header of a Gantt chart. The nested selectors `month` and `year` style those header rows separately.",
    example: styleBlock(
      "ganttDiagram {\n  timeline {\n    LineColor Gray\n    FontSize 10\n  }\n}",
      "Project starts 2026-01-05\n[Design] lasts 5 days",
    ),
    link: LINKS.style,
  },
  {
    terms: [".stereotype", "style class"],
    signature: ".<name> { <Property> <value> }",
    body: "A selector that starts with a dot matches the elements carrying that stereotype. Declare `.important { ... }` in the style block and tag elements with `<<important>>`. This is how one diagram gets several looks for the same element type.",
    example: styleBlock(".important {\n  BackGroundColor Gold\n  LineColor Crimson\n}", "class Order <<important>>\nclass Customer"),
    link: LINKS.style,
  },
];

interface StyleProperty {
  name: string;
  placeholder: string;
  body: string;
  rules: string;
  host: string;
}

const CLASS_PAIR = "class Order\nclass Customer\nOrder --> Customer";

const PROPERTIES: StyleProperty[] = [
  {
    name: "LineColor",
    placeholder: "<color>",
    body: "Style property for the colour of an element's outline, or of the line when the selector is `arrow`. It replaces the `BorderColor` and `ArrowColor` skinparam settings.",
    rules: "class {\n  LineColor DarkBlue\n}\narrow {\n  LineColor Crimson\n}",
    host: CLASS_PAIR,
  },
  {
    name: "LineThickness",
    placeholder: "<number>",
    body: "Style property for the width of an outline or arrow line in pixels. Decimal values such as `1.5` are accepted. It replaces the `BorderThickness` and `ArrowThickness` skinparam settings.",
    rules: "class {\n  LineThickness 2\n}",
    host: CLASS_PAIR,
  },
  {
    name: "LineStyle",
    placeholder: "<dash>[-<gap>]",
    body: "Style property for dashed lines. One number sets equal dash and gap lengths, and two numbers joined by a hyphen set them separately, as in `4-2`. `0` draws a solid line.",
    rules: "arrow {\n  LineStyle 4-2\n}",
    host: CLASS_PAIR,
  },
  {
    name: "FontWeight",
    placeholder: "<normal|bold|100-900>",
    body: "Style property for the weight of text. It takes `normal`, `bold` or a number from 100 to 900, like the CSS property of the same name. Older PlantUML versions only know `FontStyle bold`.",
    rules: "class {\n  FontWeight bold\n}",
    host: "class Order",
  },
  {
    name: "Margin",
    placeholder: "<number> [<number> ...]",
    body: "Style property for the space outside an element's border, in pixels. One value applies to all four sides. Several values follow the CSS order, starting at the top and going clockwise.",
    rules: "document {\n  title {\n    Margin 20\n  }\n}",
    host: "title Checkout\nAlice -> Bob: hello",
  },
  {
    name: "MaximumWidth",
    placeholder: "<number>",
    body: "Style property that wraps the text of an element when it is wider than this many pixels. It replaces the `WrapWidth` and `MaxMessageSize` skinparam settings.",
    rules: "note {\n  MaximumWidth 120\n}",
    host: "class Account\nnote right of Account: Holds the balance and every booked transaction of one customer",
  },
  {
    name: "MinimumWidth",
    placeholder: "<number>",
    body: "Style property that widens an element to at least this many pixels. It replaces the `MinClassWidth` skinparam setting.",
    rules: "class {\n  MinimumWidth 120\n}",
    host: "class Id",
  },
  {
    name: "HorizontalAlignment",
    placeholder: "<left|center|right>",
    body: "Style property that aligns the text of an element. It replaces the various `...Alignment` skinparam settings.",
    rules: "note {\n  HorizontalAlignment center\n}",
    host: "class Account\nnote right of Account\n  Holds the balance.\n  Audited nightly.\nend note",
  },
  {
    name: "DiagonalCorner",
    placeholder: "<number>",
    body: "Style property that cuts the corners of a box diagonally by this many pixels. `RoundCorner` rounds them instead.",
    rules: "class {\n  DiagonalCorner 10\n}",
    host: "class Order",
  },
  {
    name: "HeadColor",
    placeholder: "<color>",
    body: "Style property for the colour of arrow heads, used with the `arrow` selector. Without it the heads take the `LineColor`.",
    rules: "arrow {\n  LineColor Gray\n  HeadColor Crimson\n}",
    host: "Alice -> Bob: hello",
  },
  {
    name: "HyperlinkUnderlineThickness",
    placeholder: "<number>",
    body: "Style property for the width of the line under link text. `0` removes the underline.",
    rules: "root {\n  HyperlinkUnderlineThickness 0\n}",
    host: "class Account\nnote right of Account: See [[https://example.com the spec]]",
  },
];

const propertyDocs: DocRecord[] = PROPERTIES.map((p) => ({
  terms: [p.name],
  signature: `${p.name} ${p.placeholder}`,
  body: p.body,
  example: styleBlock(p.rules, p.host),
  link: LINKS.style,
}));

export const styleDocs: DocRecord[] = [...selectorDocs, ...diagramSelectorDocs, ...propertyDocs];
