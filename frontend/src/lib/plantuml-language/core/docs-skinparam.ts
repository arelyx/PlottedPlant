import { vocab } from "../vocab";
import { type DocRecord, LINKS, normalizeTerm } from "./docs-model";

// Most skinparam names are <Element><Property> (ClassBorderColor,
// SequenceGroupFontSize, ...). Those are documented from the two tables below.
// Names that do not follow the scheme, or whose value is not obvious from the
// name, are written by hand in SPECIAL.

interface Element {
  /** Plural noun phrase that completes "the border colour of ...". */
  what: string;
  /** A fragment in which the setting has a visible effect. */
  host: string;
  /** Selector for the same element in a <style> block, when one exists. */
  selector?: string;
}

interface Property {
  /** Sentence describing the setting; "%s" is replaced by the element phrase. */
  sets: string;
  placeholder: string;
  values: string;
  sample: string;
  /** Name of the matching <style> property. */
  styleProperty: string;
}

const SEQUENCE_HOST = "Alice -> Bob: hello";
const GROUP_HOST = "alt success\n  Alice -> Bob: ok\nelse failure\n  Alice -> Bob: retry\nend";
const REF_HOST = "participant Alice\nparticipant Bob\nref over Alice, Bob: Login sequence";
const SWIMLANE_HOST = "|Customer|\nstart\n:Place order;\n|Shop|\n:Ship order;\nstop";
const MEMBERS_HOST = "class Account {\n  -balance : Money\n  #audit()\n  ~notify()\n  +deposit(amount)\n}";

const ELEMENTS: Record<string, Element> = {
  Activity: { what: "activity actions", host: "start\n:Review order;\nstop", selector: "activity" },
  ActivityDiamond: {
    what: "the condition diamonds of activity diagrams",
    host: "start\nif (Paid?) then (yes)\n  :Ship order;\nendif\nstop",
    selector: "diamond",
  },
  Actor: { what: "actors", host: "actor Customer", selector: "actor" },
  Agent: { what: "`agent` elements", host: "agent Broker", selector: "agent" },
  Archimate: {
    what: "`archimate` elements",
    host: 'archimate #Business "Order handling" as orders <<business-process>>',
    selector: "archimate",
  },
  Arrow: { what: "arrows and their labels", host: "[API] --> [Database] : queries", selector: "arrow" },
  Artifact: { what: "`artifact` elements", host: "artifact app.jar", selector: "artifact" },
  Biddable: { what: "biddable domains in problem-frame diagrams", host: 'domain "Operator" as operator <<Biddable>>' },
  Boundary: { what: "`boundary` elements", host: "boundary Gateway", selector: "boundary" },
  Caption: { what: "the diagram caption", host: `caption Figure 1\n${SEQUENCE_HOST}`, selector: "caption" },
  Card: { what: "`card` elements", host: "card Summary", selector: "card" },
  CircledCharacter: { what: "the circled letter in class headers (C, I, E, A)", host: "class Account", selector: "spot" },
  Class: { what: "classes", host: "class Account", selector: "class" },
  ClassAttribute: { what: "the fields and methods listed in classes", host: MEMBERS_HOST },
  Cloud: { what: "`cloud` elements", host: "cloud Internet", selector: "cloud" },
  Component: { what: "components", host: "component Billing", selector: "component" },
  Control: { what: "`control` elements", host: "control Scheduler", selector: "control" },
  Database: { what: "`database` elements", host: "database Orders", selector: "database" },
  Default: { what: "every element that has no more specific setting", host: SEQUENCE_HOST, selector: "element" },
  DefaultMonospaced: { what: 'monospaced text such as `""code""`', host: 'Alice -> Bob: call ""login()""' },
  Designed: { what: "designed domains in problem-frame diagrams", host: 'domain "Order model" as model <<Designed>>' },
  DesignedDomain: {
    what: "designed domains in problem-frame diagrams",
    host: 'domain "Order model" as model <<Designed>>',
  },
  Diagram: { what: "the frame drawn around the whole diagram", host: SEQUENCE_HOST },
  Domain: { what: "`domain` elements in problem-frame diagrams", host: 'domain "Warehouse" as warehouse <<Causal>>' },
  Entity: { what: "`entity` elements", host: "entity Order", selector: "entity" },
  File: { what: "`file` elements", host: "file report.pdf", selector: "file" },
  Folder: { what: "`folder` elements", host: "folder Documents", selector: "folder" },
  Footer: { what: "the page footer", host: `footer Page 1\n${SEQUENCE_HOST}`, selector: "footer" },
  Frame: { what: "`frame` elements", host: "frame Subsystem", selector: "frame" },
  Header: { what: "the page header", host: `header Draft\n${SEQUENCE_HOST}`, selector: "header" },
  Hexagon: { what: "`hexagon` elements", host: "hexagon Core", selector: "hexagon" },
  IconPackage: { what: "the package-private (`~`) visibility icon", host: MEMBERS_HOST },
  IconPrivate: { what: "the private (`-`) visibility icon", host: MEMBERS_HOST },
  IconProtected: { what: "the protected (`#`) visibility icon", host: MEMBERS_HOST },
  IconPublic: { what: "the public (`+`) visibility icon", host: MEMBERS_HOST },
  Interface: { what: "interfaces", host: "interface Repository", selector: "interface" },
  Label: { what: "`label` elements", host: "label Caption", selector: "label" },
  Legend: { what: "the legend box", host: `legend\n  Blue: internal\nend legend\n${SEQUENCE_HOST}`, selector: "legend" },
  Lexical: { what: "lexical domains in problem-frame diagrams", host: 'domain "Price list" as prices <<Lexical>>' },
  Machine: { what: "machine domains in problem-frame diagrams", host: 'domain "Controller" as controller <<Machine>>' },
  Node: { what: "`node` elements", host: "node Server", selector: "node" },
  Note: { what: "notes", host: "class Account\nnote right of Account: Holds the balance", selector: "note" },
  Object: { what: "objects", host: "object order", selector: "object" },
  ObjectAttribute: { what: "the fields listed in objects", host: "object order {\n  id = 42\n}" },
  Package: { what: "packages", host: "package Billing {\n  class Invoice\n}", selector: "package" },
  Page: { what: "the page frame drawn around the diagram", host: `skinparam PageMargin 10\n${SEQUENCE_HOST}` },
  Participant: { what: "sequence participants", host: "participant Server", selector: "participant" },
  Partition: { what: "activity partitions", host: "partition Checkout {\n  :Pay;\n}", selector: "partition" },
  Person: { what: "`person` elements", host: "person Customer", selector: "person" },
  Queue: { what: "`queue` elements", host: "queue Jobs", selector: "queue" },
  Rectangle: { what: "`rectangle` elements", host: "rectangle Backend", selector: "rectangle" },
  Requirement: {
    what: "`requirement` elements in problem-frame diagrams",
    host: 'requirement "Orders ship within a day" as shipping',
    selector: "requirement",
  },
  Sequence: { what: "sequence diagram elements", host: "participant Server <<service>>\nAlice -> Server: request" },
  SequenceActor: { what: "actors in sequence diagrams", host: "actor Customer\nCustomer -> Server: request", selector: "actor" },
  SequenceBox: {
    what: "`box` groups around participants",
    host: 'box "Backend"\n  participant Server\nend box\nAlice -> Server: request',
    selector: "box",
  },
  SequenceDelay: {
    what: "delay markers (`...`)",
    host: "Alice -> Bob: request\n... 5 minutes later ...\nBob --> Alice: reply",
    selector: "delay",
  },
  SequenceDivider: {
    what: "dividers (`== text ==`)",
    host: "Alice -> Bob: request\n== Shutdown ==\nBob --> Alice: bye",
    selector: "separator",
  },
  SequenceGroup: { what: "group frames such as `alt`, `loop` and `group`", host: GROUP_HOST, selector: "group" },
  SequenceGroupBody: { what: "the area inside group frames such as `alt` and `loop`", host: GROUP_HOST },
  SequenceGroupHeader: { what: "the label tab of group frames such as `alt` and `loop`", host: GROUP_HOST, selector: "groupHeader" },
  SequenceLifeLine: { what: "lifelines", host: SEQUENCE_HOST, selector: "lifeLine" },
  SequenceParticipant: { what: "sequence participants", host: "participant Server\nAlice -> Server: request", selector: "participant" },
  SequenceReference: { what: "`ref` frames", host: REF_HOST, selector: "reference" },
  SequenceReferenceHeader: { what: "the label tab of `ref` frames", host: REF_HOST, selector: "referenceHeader" },
  Stack: { what: "`stack` elements", host: "stack Layers", selector: "stack" },
  State: { what: "states", host: "[*] --> Active", selector: "state" },
  StateAttribute: { what: "the description lines inside states", host: "state Active : entry / start timer" },
  Storage: { what: "`storage` elements", host: "storage Archive", selector: "storage" },
  Swimlane: { what: "the lines between activity swimlanes", host: SWIMLANE_HOST, selector: "swimlane" },
  SwimlaneTitle: { what: "activity swimlane titles", host: SWIMLANE_HOST },
  Timing: { what: "timing diagram text", host: 'robust "Server" as S\n@0\nS is Idle\n@10\nS is Busy' },
  Title: { what: "the diagram title", host: `title Checkout flow\n${SEQUENCE_HOST}`, selector: "title" },
  Usecase: { what: "use cases", host: "usecase Checkout", selector: "usecase" },
};

const COLOR_VALUES = "The value is a colour name or a hex code such as `#336699`.";

const PROPERTIES: Record<string, Property> = {
  FontColor: {
    sets: "Sets the text colour of %s.",
    placeholder: "<color>",
    values: COLOR_VALUES,
    sample: "Navy",
    styleProperty: "FontColor",
  },
  FontName: {
    sets: "Sets the font family for the text of %s.",
    placeholder: "<font>",
    values: "The renderer falls back to a default font when the named one is not installed.",
    sample: "Courier",
    styleProperty: "FontName",
  },
  FontSize: {
    sets: "Sets the text size of %s.",
    placeholder: "<number>",
    values: "The value is a whole number such as `14`.",
    sample: "14",
    styleProperty: "FontSize",
  },
  FontStyle: {
    sets: "Sets the text style of %s.",
    placeholder: "<plain|bold|italic>",
    values: "The value is `plain`, `bold`, `italic` or `bold italic`.",
    sample: "bold",
    styleProperty: "FontStyle",
  },
  BackgroundColor: {
    sets: "Sets the fill colour of %s.",
    placeholder: "<color>",
    values: COLOR_VALUES,
    sample: "LightYellow",
    styleProperty: "BackGroundColor",
  },
  BorderColor: {
    sets: "Sets the outline colour of %s.",
    placeholder: "<color>",
    values: COLOR_VALUES,
    sample: "DarkSlateGray",
    styleProperty: "LineColor",
  },
  BorderThickness: {
    sets: "Sets the outline width of %s.",
    placeholder: "<number>",
    values: "The value is a width in pixels such as `2`.",
    sample: "2",
    styleProperty: "LineThickness",
  },
};

// Longest first, so "StereotypeFontColor" is not read as element "…Stereotype" + "FontColor" by accident.
const PROPERTY_NAMES = Object.keys(PROPERTIES).sort((a, b) => b.length - a.length);

/** Add a stereotype to the element declared on the first line of a host fragment. */
function withStereotype(host: string): string {
  const [first, ...rest] = host.split("\n");
  const declared = first.endsWith(" {") ? `${first.slice(0, -2)} <<service>> {` : `${first} <<service>>`;
  return [declared, ...rest].join("\n");
}

function generate(name: string): DocRecord | undefined {
  const property = PROPERTY_NAMES.find((p) => name.endsWith(p) && name.length > p.length);
  if (!property) return undefined;
  let elementName = name.slice(0, -property.length);
  const stereotype = elementName.endsWith("Stereotype") && elementName !== "Stereotype";
  if (stereotype) elementName = elementName.slice(0, -"Stereotype".length);
  const element = ELEMENTS[elementName];
  if (!element) return undefined;

  const spec = PROPERTIES[property];
  const what = stereotype ? `the \`<<stereotype>>\` label on ${element.what}` : element.what;
  const block = `skinparam ${elementName} { ${stereotype ? "Stereotype" : ""}${property} ${spec.sample} }`;
  const sentences = [spec.sets.replace("%s", what), spec.values, `The block form \`${block}\` sets the same thing.`];
  if (element.selector && !stereotype) {
    sentences.push(`In a \`<style>\` block the equivalent is \`${element.selector} { ${spec.styleProperty} ${spec.sample} }\`.`);
  }
  const host = stereotype && !element.host.includes("<<") ? withStereotype(element.host) : element.host;
  return {
    terms: [name],
    signature: `skinparam ${name} ${spec.placeholder}`,
    body: sentences.join(" "),
    example: `skinparam ${name} ${spec.sample}\n${host}`,
    link: LINKS.skinparam,
  };
}

interface Special {
  name: string;
  placeholder: string;
  body: string;
  /** Example value followed by the fragment it applies to. */
  value: string;
  host: string;
  aliases?: string[];
}

const CLASS_PAIR = "class Order\nclass Customer\nOrder --> Customer : placed by";
const ACTIVITY_IF = "start\nif (Paid?) then (yes)\n  :Ship order;\nelse (no)\n  :Send reminder;\nendif\nstop";

const SPECIAL: Special[] = [
  {
    name: "ArrowColor",
    placeholder: "<color>",
    body: "Sets the colour of every arrow, line and arrow head. A single arrow can override it inline, as in `-[#red]->`. In a `<style>` block the equivalent is `arrow { LineColor ... }`.",
    value: "DarkBlue",
    host: CLASS_PAIR,
  },
  {
    name: "ArrowHeadColor",
    placeholder: "<color>",
    body: "Sets the colour of arrow heads without changing the line. Use it together with `ArrowColor` when heads and lines should differ.",
    value: "Crimson",
    host: SEQUENCE_HOST,
  },
  {
    name: "ArrowLollipopColor",
    placeholder: "<color>",
    body: "Sets the fill colour of the lollipop circle drawn by links such as `-()` and `()-`. Without it the circle takes the diagram background colour.",
    value: "Gold",
    host: "class Repository\nclass Service\nService -() Repository",
  },
  {
    name: "ArrowMessageAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the label text on arrows in class, component and similar diagrams. The default is `left`. Sequence diagrams use `SequenceMessageAlignment` instead.",
    value: "center",
    host: CLASS_PAIR,
  },
  {
    name: "ArrowThickness",
    placeholder: "<number>",
    body: "Sets the line width of every arrow in pixels. A single arrow can override it inline with `-[thickness=2]->`.",
    value: "2",
    host: CLASS_PAIR,
  },
  {
    name: "BackgroundColor",
    placeholder: "<color>",
    body: "Sets the background colour of the whole diagram. `transparent` removes the background. As a suffix (`ClassBackgroundColor`, `NoteBackgroundColor`) or inside a `skinparam class { }` block it sets the fill colour of that element instead.",
    value: "WhiteSmoke",
    host: SEQUENCE_HOST,
  },
  {
    name: "BoxPadding",
    placeholder: "<number>",
    body: "Adds horizontal space, in pixels, around each `box` of participants in a sequence diagram. Useful when neighbouring boxes touch.",
    value: "10",
    host: 'box "Frontend"\n  participant Browser\nend box\nbox "Backend"\n  participant Server\nend box\nBrowser -> Server: request',
  },
  {
    name: "CircledCharacterRadius",
    placeholder: "<number>",
    body: "Sets the radius, in pixels, of the circled letter (C, I, E, A) shown in class headers.",
    value: "8",
    host: "class Account",
  },
  {
    name: "ClassAttributeIconSize",
    placeholder: "<number>",
    body: "Sets the size of the visibility icons in front of class members. The value `0` replaces the icons with the plain characters `+`, `-`, `#` and `~`, which is the usual UML notation.",
    value: "0",
    host: MEMBERS_HOST,
  },
  {
    name: "ColorArrowSeparationSpace",
    placeholder: "<number>",
    body: "Sets the gap, in pixels, between the parallel lines of a multi-colour arrow in an activity diagram, such as `-[#red,#blue]->`.",
    value: "3",
    host: "start\n:Order;\n-[#red,#blue]->\n:Ship;\nstop",
  },
  {
    name: "ComponentStyle",
    placeholder: "<uml1|uml2|rectangle>",
    body: "Chooses how components are drawn. `uml2` is the default and shows a small component icon in the corner. `uml1` draws the older shape with two tabs on the left edge, and `rectangle` draws a plain box.",
    value: "rectangle",
    host: "[Billing] --> [Ledger]",
  },
  {
    name: "ConditionEndStyle",
    placeholder: "<diamond|hline>",
    body: "Chooses how the branches of an `if` join again in an activity diagram. `diamond` is the default. `hline` joins them with a horizontal line.",
    value: "hline",
    host: ACTIVITY_IF,
  },
  {
    name: "ConditionStyle",
    placeholder: "<inside|diamond|InsideDiamond>",
    body: "Chooses the shape of `if` conditions in an activity diagram. `inside` is the default and writes the test inside a hexagon. `diamond` draws an empty diamond with the test next to it, and `InsideDiamond` writes the test inside a diamond.",
    value: "diamond",
    host: ACTIVITY_IF,
  },
  {
    name: "DefaultTextAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns multi-line text inside elements. It applies wherever no more specific alignment setting exists.",
    value: "center",
    host: 'rectangle "Order service\\nhandles checkout"',
  },
  {
    name: "Dpi",
    placeholder: "<number>",
    body: "Sets the resolution of the rendered image. The default is 96. A higher value produces a proportionally larger image, which helps when a PNG looks blurry in print.",
    value: "150",
    host: SEQUENCE_HOST,
  },
  {
    name: "FixCircleLabelOverlapping",
    placeholder: "<true|false>",
    body: "When `true`, reserves room for the label of circle-shaped elements such as lollipop interfaces, so the label does not overlap neighbouring lines.",
    value: "true",
    host: "() Repository\n[Service] --> Repository",
  },
  {
    name: "GenericDisplay",
    placeholder: "<old>",
    body: "The value `old` writes generic parameters after the class name, as in `Box<T>`, instead of in the dashed box at the top right corner of the class.",
    value: "old",
    host: "class Box<T>",
  },
  {
    name: "Guillemet",
    placeholder: "<false|none|open close>",
    body: "Controls the marks around stereotypes. By default PlantUML draws the characters « and ». `false` keeps the typed `<<` and `>>`, `none` removes the marks, and two strings separated by a space set custom opening and closing marks.",
    value: "false",
    host: "class Account <<aggregate>>",
  },
  {
    name: "Handwritten",
    placeholder: "<true|false>",
    body: "When `true`, draws the diagram with wobbly lines, as if sketched by hand. Useful for drafts that should not look final.",
    value: "true",
    host: SEQUENCE_HOST,
  },
  {
    name: "HyperlinkColor",
    placeholder: "<color>",
    body: "Sets the colour of link text written as `[[url label]]`.",
    value: "DarkGreen",
    host: "class Account\nnote right of Account: See [[https://example.com the spec]]",
  },
  {
    name: "HyperlinkUnderline",
    placeholder: "<true|false>",
    body: "Set to `false` to remove the underline from link text written as `[[url label]]`. Links are underlined by default.",
    value: "false",
    host: "class Account\nnote right of Account: See [[https://example.com the spec]]",
  },
  {
    name: "IconIEMandatoryColor",
    placeholder: "<color>",
    body: "Sets the colour of the marker drawn in front of mandatory attributes, the ones written with a leading `*`, in entity diagrams.",
    value: "Crimson",
    host: "entity Order {\n  * id : int\n  note : text\n}",
  },
  {
    name: "IconPackageColor",
    placeholder: "<color>",
    body: "Sets the outline colour of the package-private (`~`) visibility icon on class members. `IconPackageBackgroundColor` sets its fill.",
    value: "DarkBlue",
    host: MEMBERS_HOST,
  },
  {
    name: "IconPrivateColor",
    placeholder: "<color>",
    body: "Sets the outline colour of the private (`-`) visibility icon on class members. `IconPrivateBackgroundColor` sets its fill.",
    value: "DarkRed",
    host: MEMBERS_HOST,
  },
  {
    name: "IconProtectedColor",
    placeholder: "<color>",
    body: "Sets the outline colour of the protected (`#`) visibility icon on class members. `IconProtectedBackgroundColor` sets its fill.",
    value: "DarkOrange",
    host: MEMBERS_HOST,
  },
  {
    name: "IconPublicColor",
    placeholder: "<color>",
    body: "Sets the outline colour of the public (`+`) visibility icon on class members. `IconPublicBackgroundColor` sets its fill.",
    value: "DarkGreen",
    host: MEMBERS_HOST,
  },
  {
    name: "Linetype",
    placeholder: "<ortho|polyline>",
    body: "Chooses how links are routed in diagrams laid out by Graphviz, such as class and component diagrams. `ortho` uses only horizontal and vertical segments, `polyline` uses straight segments, and the default is curved splines. With `ortho`, labels can end up far from their line.",
    value: "ortho",
    host: CLASS_PAIR,
  },
  {
    name: "MaxAsciiMessageLength",
    placeholder: "<number>",
    body: "Wraps message text after this many characters when a sequence diagram is exported as ASCII art. It has no effect on image output.",
    value: "30",
    host: "Alice -> Bob: a long message that would stretch the text output",
  },
  {
    name: "MaxMessageSize",
    placeholder: "<number>",
    body: "Wraps the text of sequence messages that are wider than this many pixels. Without it a long message stretches the distance between participants.",
    value: "100",
    host: "Alice -> Bob: a long message that would otherwise push the two lifelines far apart",
    aliases: ["WrapMessageWidth"],
  },
  {
    name: "MinClassWidth",
    placeholder: "<number>",
    body: "Sets a minimum width, in pixels, for class boxes. Classes with short names are widened to it.",
    value: "120",
    host: "class Id",
  },
  {
    name: "Monochrome",
    placeholder: "<true|reverse>",
    body: "`true` renders the diagram in black, white and greys. `reverse` does the same with white lines on a black background.",
    value: "true",
    host: SEQUENCE_HOST,
  },
  {
    name: "Nodesep",
    placeholder: "<number>",
    body: "Sets the minimum gap, in pixels, between neighbouring elements on the same level in diagrams laid out by Graphviz. Raise it to spread siblings apart. `Ranksep` controls the gap between levels.",
    value: "80",
    host: "class Order\nclass Customer\nclass Product\nOrder --> Customer\nOrder --> Product",
  },
  {
    name: "NoteShadowing",
    placeholder: "<true|false>",
    body: "Turns the drop shadow of notes on or off, independently of the global `Shadowing` setting.",
    value: "true",
    host: "class Account\nnote right of Account: Holds the balance",
  },
  {
    name: "NoteTextAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the text lines inside notes. The default is `left`.",
    value: "center",
    host: "class Account\nnote right of Account\n  Holds the balance.\n  Audited nightly.\nend note",
  },
  {
    name: "PackageStyle",
    placeholder: "<folder|rectangle|node|frame|cloud|database>",
    body: "Chooses the default shape of packages. `folder` is the default. Other accepted values include `rectangle`, `node`, `frame`, `cloud`, `database`, `agent`, `storage`, `artifact` and `card`. A single package can override it with a stereotype such as `<<Frame>>`.",
    value: "rectangle",
    host: "package Billing {\n  class Invoice\n}",
  },
  {
    name: "PackageTitleAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the title of packages and other containers. The default is `center`.",
    value: "left",
    host: "package Billing {\n  class Invoice\n  class Payment\n}",
  },
  {
    name: "Padding",
    placeholder: "<number>",
    body: "Adds inner spacing, in pixels, between the border of an element and its content. In sequence diagrams it enlarges participant boxes and notes.",
    value: "8",
    host: SEQUENCE_HOST,
  },
  {
    name: "PageExternalColor",
    placeholder: "<color>",
    body: "Sets the colour of the area outside the page frame. It only shows when `PageMargin` leaves room around the diagram. `PageBorderColor` sets the frame line.",
    value: "LightGray",
    host: `skinparam PageMargin 10\n${SEQUENCE_HOST}`,
  },
  {
    name: "PageMargin",
    placeholder: "<number>",
    body: "Adds a margin of this many pixels around the diagram and draws a page frame in it. `PageBorderColor` and `PageExternalColor` set the colours of that frame.",
    value: "10",
    host: SEQUENCE_HOST,
  },
  {
    name: "ParticipantPadding",
    placeholder: "<number>",
    body: "Adds horizontal space, in pixels, on both sides of each participant in a sequence diagram. Raise it to spread lifelines apart without lengthening messages.",
    value: "20",
    host: SEQUENCE_HOST,
  },
  {
    name: "PathHoverColor",
    placeholder: "<color>",
    body: "Sets the colour a link takes while the mouse pointer is over it. It only works in SVG output viewed in a browser.",
    value: "Red",
    host: CLASS_PAIR,
  },
  {
    name: "Ranksep",
    placeholder: "<number>",
    body: "Sets the minimum gap, in pixels, between levels in diagrams laid out by Graphviz. Raise it to lengthen the links between a parent and its children. `Nodesep` controls the gap between siblings.",
    value: "80",
    host: CLASS_PAIR,
  },
  {
    name: "ResponseMessageBelowArrow",
    placeholder: "<true|false>",
    body: "When `true`, writes the text of reply messages (dashed arrows) below the arrow instead of above it. This follows the layout some UML textbooks use for returns.",
    value: "true",
    host: "Alice -> Bob: request\nBob --> Alice: response",
  },
  {
    name: "RoundCorner",
    placeholder: "<number>",
    body: "Rounds the corners of boxes by this radius in pixels. `0` gives square corners. It can also be set per element, as in `skinparam class { RoundCorner 10 }`.",
    value: "10",
    host: "class Account",
  },
  {
    name: "SameClassWidth",
    placeholder: "<true|false>",
    body: "When `true`, draws every class as wide as the widest one, which lines columns up in dense class diagrams.",
    value: "true",
    host: "class Id\nclass CustomerAccountRepository",
  },
  {
    name: "SequenceArrowThickness",
    placeholder: "<number>",
    body: "Sets the line width of message arrows in sequence diagrams, in pixels.",
    value: "2",
    host: SEQUENCE_HOST,
  },
  {
    name: "SequenceMessageAlignment",
    placeholder: "<left|center|right|direction|reverseDirection>",
    body: "Aligns message text along the arrow in sequence diagrams. `left` is the default. `direction` puts the text at the tail of the arrow, so it follows the message direction, and `reverseDirection` puts it at the head.",
    value: "center",
    host: "Alice -> Bob: request\nBob --> Alice: response",
    aliases: ["SequenceMessageAlign"],
  },
  {
    name: "SequenceMessageTextAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the lines of a multi-line message relative to each other in sequence diagrams. `SequenceMessageAlignment` positions the whole text block along the arrow.",
    value: "center",
    host: "Alice -> Bob: first line\\nsecond, longer line",
  },
  {
    name: "SequenceNewpageSeparatorColor",
    placeholder: "<color>",
    body: "Sets the colour of the line that marks a `newpage` break in a sequence diagram.",
    value: "Gray",
    host: "Alice -> Bob: request\nnewpage\nBob --> Alice: response",
  },
  {
    name: "SequenceParticipant",
    placeholder: "<underline>",
    body: "The value `underline` underlines participant names, the UML notation for object instances.",
    value: "underline",
    host: "participant Server\nAlice -> Server: request",
  },
  {
    name: "SequenceReferenceAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the text inside `ref` frames in sequence diagrams. The default is `center`.",
    value: "left",
    host: REF_HOST,
  },
  {
    name: "Shadowing",
    placeholder: "<true|false>",
    body: "Turns drop shadows on or off for all elements. Current default themes draw no shadows. It can also be set per element, as in `skinparam class { Shadowing true }`.",
    value: "true",
    host: "class Account",
  },
  {
    name: "StateMessageAlignment",
    placeholder: "<left|center|right>",
    body: "Aligns the label text on transitions in state diagrams. The default is `center`.",
    value: "left",
    host: "[*] --> Active : start\\nwith a long label",
  },
  {
    name: "StereotypePosition",
    placeholder: "<top|bottom>",
    body: "Places the `<<stereotype>>` above the element name (`top`, the default) or below it (`bottom`).",
    value: "bottom",
    host: "component Billing <<service>>",
  },
  {
    name: "skinparam style",
    placeholder: "<strictuml>",
    body: "The value `strictuml` switches to stricter UML notation: triangular arrow heads in sequence diagrams, underlined object names and no drop shadows. It is unrelated to `<style>` blocks, which are the newer replacement for skinparam settings in general.",
    value: "strictuml",
    host: SEQUENCE_HOST,
  },
  {
    name: "SvglinkTarget",
    placeholder: "<_top|_blank|_self|_parent>",
    body: "Sets the `target` attribute of hyperlinks in SVG output. The default is `_top`. Use `_blank` to open links in a new tab.",
    value: "_blank",
    host: "class Account [[https://example.com]]",
  },
  {
    name: "SwimlaneWidth",
    placeholder: "<number|same>",
    body: "Sets a minimum width, in pixels, for activity swimlanes. `same` gives every swimlane the width of the widest one.",
    value: "same",
    host: SWIMLANE_HOST,
  },
  {
    name: "SwimlaneWrapTitleWidth",
    placeholder: "<number>",
    body: "Wraps swimlane titles that are wider than this many pixels, so a long title does not widen its lane.",
    value: "80",
    host: "|Customer service department|\nstart\n:Answer call;\nstop",
  },
  {
    name: "TabSize",
    placeholder: "<number>",
    body: "Sets how many spaces a tab character in text counts for. The default is 8.",
    value: "4",
    host: SEQUENCE_HOST,
  },
  {
    name: "TitleBorderRoundCorner",
    placeholder: "<number>",
    body: "Rounds the corners of the frame around the title by this radius in pixels. The frame only shows when `TitleBorderThickness` or `TitleBorderColor` is set.",
    value: "10",
    host: `skinparam TitleBorderThickness 1\ntitle Checkout flow\n${SEQUENCE_HOST}`,
  },
  {
    name: "WrapWidth",
    placeholder: "<number>",
    body: "Wraps text in notes and elements that is wider than this many pixels. Sequence message text uses `MaxMessageSize` instead.",
    value: "120",
    host: "class Account\nnote right of Account: Holds the balance and every booked transaction of one customer",
  },
  {
    name: "ActorStyle",
    placeholder: "<stick|awesome|hollow>",
    body: "Chooses how actors are drawn. The default is a stick figure. `awesome` draws a filled person icon and `hollow` an outlined one.",
    value: "awesome",
    host: "actor Customer\nCustomer --> (Checkout)",
  },
];

// A name may be spelled "skinparam x" when the bare word belongs to another
// entry (the `style` keyword); the prefix is not repeated in the usage line.
const usage = (name: string) => (name.startsWith("skinparam ") ? name : `skinparam ${name}`);

const specialRecords: DocRecord[] = SPECIAL.map((s) => ({
  terms: [s.name, ...(s.aliases ?? [])],
  signature: `${usage(s.name)} ${s.placeholder}`,
  body: s.body,
  example: `${usage(s.name)} ${s.value}\n${s.host}`,
  link: LINKS.skinparam,
}));

/** The property suffixes on their own, as written inside `skinparam element { }` blocks. */
const propertyRecords: DocRecord[] = Object.entries(PROPERTIES)
  // BackgroundColor on its own is the diagram-wide setting, documented above.
  .filter(([name]) => name !== "BackgroundColor")
  .map(([name, spec]) => ({
    terms: [name],
    signature: `skinparam <element> { ${name} ${spec.placeholder} }`,
    body: `${spec.sets.replace("%s", "the enclosing element")} ${spec.values} Written inside a \`skinparam <element> { }\` block, or joined to the element name as in \`Class${name}\`.${
      name === spec.styleProperty ? " `<style>` blocks use the same property name." : ` In a \`<style>\` block the property is called \`${spec.styleProperty}\`.`
    }`,
    example: `skinparam class {\n  ${name} ${spec.sample}\n}\nclass Account`,
    link: LINKS.skinparam,
  }));

/** Hand-written skinparam entries: irregular names, global switches and bare property names. */
export const skinparamDocs: DocRecord[] = [...specialRecords, ...propertyRecords];

let generated: DocRecord[] | undefined;

/** One entry for every regular <Element><Property> name in PlantUML's skinparam list. */
export function generatedSkinparamDocs(): DocRecord[] {
  if (generated) return generated;
  const handwritten = new Set(skinparamDocs.flatMap((r) => r.terms.map(normalizeTerm)));
  generated = vocab.skinparams
    .filter((name) => !handwritten.has(normalizeTerm(name)))
    .flatMap((name) => generate(name) ?? []);
  return generated;
}
