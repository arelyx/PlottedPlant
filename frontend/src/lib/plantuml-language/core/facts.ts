import type { DiagramKind } from "./types";

/**
 * Language facts the completion and signature features need that are not in
 * PlantUML's generated word lists: builtin function arities, `<style>` names,
 * the arrows worth offering per diagram type. Names and arities come from the
 * PlantUML source (tim/builtin, style/SName, style/PName); descriptions are
 * our own.
 */

export interface BuiltinFunction {
  /** Name with the leading `%`. */
  name: string;
  /** Parameter names; a trailing `?` marks an optional one, a leading `...` a variadic tail. */
  params: string[];
  summary: string;
}

export const BUILTIN_FUNCTIONS: BuiltinFunction[] = [
  { name: "%and", params: ["a", "b", "...more"], summary: "Logical AND of two or more values." },
  { name: "%backslash", params: [], summary: "A literal backslash character." },
  { name: "%boolval", params: ["value"], summary: "Converts a string, number or JSON value to a boolean." },
  { name: "%breakline", params: [], summary: "A line break in the PlantUML source itself." },
  { name: "%call_user_func", params: ["name", "...args"], summary: "Calls a user function by name and returns its result." },
  { name: "%chr", params: ["codePoint"], summary: "The character for a Unicode code point." },
  { name: "%darken", params: ["color", "ratio"], summary: "A darker shade of a colour (ratio 0-100)." },
  { name: "%date", params: ["format?", "time?", "zone?"], summary: "The current (or given) date, optionally formatted." },
  { name: "%dec2hex", params: ["value"], summary: "A number as a hexadecimal string." },
  { name: "%dirpath", params: [], summary: "Directory of the current file." },
  { name: "%dollar", params: [], summary: "A literal dollar sign." },
  { name: "%eval", params: ["expression"], summary: "Evaluates a string as an expression." },
  { name: "%false", params: [], summary: "Always false." },
  { name: "%feature", params: ["name"], summary: "Whether this PlantUML version supports a feature." },
  { name: "%file_exists", params: ["path"], summary: "Whether a local file exists." },
  { name: "%filedate", params: [], summary: "Modification date of the current file." },
  { name: "%filename", params: [], summary: "Name of the current file." },
  { name: "%filename_no_extension", params: [], summary: "Name of the current file without its extension." },
  { name: "%function_exists", params: ["name"], summary: "Whether a function or procedure is defined." },
  { name: "%get_all_stdlib", params: ["detailed?"], summary: "JSON list of the bundled standard libraries." },
  { name: "%get_all_theme", params: [], summary: "JSON array of the available theme names." },
  { name: "%get_current_theme", params: [], summary: "Name of the theme in use." },
  { name: "%get_json_keys", params: ["json"], summary: "The keys of a JSON object, as a JSON array." },
  { name: "%get_json_type", params: ["json"], summary: "The type of a JSON value (object, array, string, ...)." },
  { name: "%get_stdlib", params: ["name?", "detailed?"], summary: "Information about one bundled standard library." },
  { name: "%get_variable_value", params: ["name"], summary: "Value of the variable with the given name." },
  { name: "%getenv", params: ["name"], summary: "Value of an environment variable." },
  { name: "%hex2dec", params: ["hex"], summary: "A hexadecimal string as a number." },
  { name: "%hsl_color", params: ["hue", "saturation", "lightness", "alpha?"], summary: "A colour from HSL (and optional alpha) components." },
  { name: "%intval", params: ["value"], summary: "Converts a string to an integer." },
  { name: "%invoke_procedure", params: ["name", "...args"], summary: "Calls a procedure by name." },
  { name: "%is_dark", params: ["color"], summary: "Whether a colour is dark." },
  { name: "%is_light", params: ["color"], summary: "Whether a colour is light." },
  { name: "%json_add", params: ["json", "keyOrValue", "value?"], summary: "Adds a value to a JSON array, or a key/value pair to an object." },
  { name: "%json_key_exists", params: ["json", "key"], summary: "Whether a JSON object has a key." },
  { name: "%json_merge", params: ["first", "second"], summary: "Merges two JSON objects or arrays." },
  { name: "%json_remove", params: ["json", "key"], summary: "Removes a key or index from JSON data." },
  { name: "%json_set", params: ["json", "key", "value?"], summary: "Sets a key or index in JSON data." },
  { name: "%left_align", params: [], summary: "Marks the text that follows as left-aligned." },
  { name: "%lighten", params: ["color", "ratio"], summary: "A lighter shade of a colour (ratio 0-100)." },
  { name: "%load_json", params: ["source", "default?", "charset?"], summary: "Loads JSON from a file or URL." },
  { name: "%lower", params: ["text"], summary: "Text in lower case." },
  { name: "%mod", params: ["dividend", "divisor"], summary: "Remainder of an integer division." },
  { name: "%n", params: [], summary: "A line break in rendered text (short for %newline)." },
  { name: "%nand", params: ["a", "b", "...more"], summary: "Logical NAND." },
  { name: "%newline", params: [], summary: "A line break in rendered text." },
  { name: "%nor", params: ["a", "b", "...more"], summary: "Logical NOR." },
  { name: "%not", params: ["value"], summary: "Logical negation." },
  { name: "%now", params: [], summary: "Current time as seconds since the Unix epoch." },
  { name: "%nxor", params: ["a", "b", "...more"], summary: "Logical XNOR." },
  { name: "%or", params: ["a", "b", "...more"], summary: "Logical OR of two or more values." },
  { name: "%ord", params: ["character"], summary: "Unicode code point of a character." },
  { name: "%percent", params: [], summary: "A literal percent sign." },
  { name: "%random", params: ["min?", "max?"], summary: "A random integer: 0 or 1, below one bound, or between two." },
  { name: "%retrieve_procedure", params: ["name", "...args"], summary: "Runs a procedure and returns what it would output." },
  { name: "%reverse_color", params: ["color"], summary: "The RGB-inverted colour." },
  { name: "%reverse_hsluv_color", params: ["color"], summary: "The colour inverted in HSLuv space (keeps contrast)." },
  { name: "%right_align", params: [], summary: "Marks the text that follows as right-aligned." },
  { name: "%set_variable_value", params: ["name", "value"], summary: "Sets a global variable by name." },
  { name: "%size", params: ["value"], summary: "Length of a string, or number of entries in JSON data." },
  { name: "%splitstr", params: ["text", "separator"], summary: "Splits a string into a JSON array." },
  { name: "%splitstr_regex", params: ["text", "regex"], summary: "Splits a string on a regular expression." },
  { name: "%str2json", params: ["text"], summary: "Parses a string as JSON." },
  { name: "%string", params: ["value"], summary: "Converts a value to a string." },
  { name: "%strlen", params: ["text"], summary: "Length of a string." },
  { name: "%strpos", params: ["text", "search"], summary: "Position of a substring, or -1." },
  { name: "%substr", params: ["text", "start", "length?"], summary: "Part of a string." },
  { name: "%tab", params: [], summary: "A tab character." },
  { name: "%true", params: [], summary: "Always true." },
  { name: "%upper", params: ["text"], summary: "Text in upper case." },
  { name: "%variable_exists", params: ["name"], summary: "Whether a variable is defined." },
  { name: "%version", params: [], summary: "The running PlantUML version." },
];

const BUILTIN_BY_NAME = new Map(BUILTIN_FUNCTIONS.map((f) => [f.name, f]));

export function builtinFunction(name: string): BuiltinFunction | undefined {
  return BUILTIN_BY_NAME.get(name.toLowerCase());
}

export function builtinSignature(fn: BuiltinFunction): string {
  return `${fn.name}(${fn.params.join(", ")})`;
}

/** Selectors usable in `<style>` blocks (diagram-level ones end in "Diagram"). */
export const STYLE_SELECTORS = [
  "root", "document", "element", "title", "caption", "header", "footer", "legend", "note", "arrow", "group", "groupHeader",
  "separator", "stereotype", "package", "node", "mainframe", "sequenceDiagram", "participant", "actor", "boundary",
  "control", "entity", "database", "collections", "queue", "lifeLine", "activationBox", "reference", "referenceHeader",
  "box", "delay", "destroy", "newpage", "classDiagram", "class", "interface", "object", "objectDiagram", "map", "json",
  "spot", "spotClass", "spotInterface", "spotEnum", "spotAbstractClass", "spotAnnotation", "visibilityIcon", "private",
  "protected", "public", "stateDiagram", "state", "stateBody", "composite", "activityDiagram", "activity", "activityBar",
  "diamond", "swimlane", "partition", "goto", "start", "stop", "end", "componentDiagram", "component", "port", "artifact",
  "cloud", "folder", "frame", "rectangle", "storage", "agent", "card", "file", "hexagon", "label", "person", "process",
  "stack", "usecase", "business", "archimate", "requirement", "timingDiagram", "robust", "concise", "clock", "binary",
  "analog", "timeline", "highlight", "constraintArrow", "ganttDiagram", "task", "milestone", "undone", "unstarted",
  "closed", "timegrid", "day", "month", "year", "mindmapDiagram", "wbsDiagram", "rootNode", "leafNode", "boxless",
  "nwdiagDiagram", "network", "server", "saltDiagram", "jsonDiagram", "yamlDiagram", "chenEerDiagram", "chenEntity",
  "chenRelationship", "chenAttribute", "ebnf", "regex", "cardinality", "circle", "collection", "clickable", "qualified",
  "generic", "name", "description",
];

/** Properties usable inside a `<style>` rule. */
export const STYLE_PROPERTIES = [
  "BackGroundColor", "LineColor", "LineThickness", "LineStyle", "FontColor", "FontName", "FontSize", "FontStyle",
  "FontWeight", "RoundCorner", "DiagonalCorner", "Shadowing", "Padding", "Margin", "MaximumWidth", "MinimumWidth",
  "HorizontalAlignment", "HyperLinkColor", "HyperlinkUnderlineStyle", "HyperlinkUnderlineThickness", "HeadColor",
  "ShowStereotype", "ImagePosition", "ExportedName", "Image", "MarkerShape", "MarkerSize", "MarkerColor", "BarWidth",
  "Width",
];

export interface ArrowFact {
  arrow: string;
  description: string;
}

const SEQUENCE_ARROWS: ArrowFact[] = [
  { arrow: "->", description: "Message (solid line, filled head)" },
  { arrow: "-->", description: "Reply (dashed line)" },
  { arrow: "->>", description: "Asynchronous message (open head)" },
  { arrow: "-->>", description: "Asynchronous reply (dashed, open head)" },
  { arrow: "<-", description: "Message drawn right to left" },
  { arrow: "<--", description: "Reply drawn right to left" },
  { arrow: "<->", description: "Message in both directions" },
  { arrow: "->x", description: "Lost message (ends in a cross)" },
  { arrow: "->o", description: "Message ending in a circle" },
  { arrow: "-\\", description: "Upper half arrow head" },
  { arrow: "-/", description: "Lower half arrow head" },
  { arrow: "-[#red]>", description: "Coloured message" },
];

const CLASS_ARROWS: ArrowFact[] = [
  { arrow: "<|--", description: "Inheritance: right extends left" },
  { arrow: "--|>", description: "Inheritance: left extends right" },
  { arrow: "<|..", description: "Realization: right implements left" },
  { arrow: "..|>", description: "Realization: left implements right" },
  { arrow: "*--", description: "Composition: left owns right" },
  { arrow: "o--", description: "Aggregation: left has right" },
  { arrow: "-->", description: "Directed association" },
  { arrow: "--", description: "Association" },
  { arrow: "..>", description: "Dependency" },
  { arrow: "..", description: "Dotted link (notes, weak relation)" },
  { arrow: "-[hidden]-", description: "Invisible link, for layout only" },
];

const ER_ARROWS: ArrowFact[] = [
  { arrow: "||--o{", description: "Exactly one to zero or many" },
  { arrow: "||--|{", description: "Exactly one to one or many" },
  { arrow: "||--||", description: "Exactly one to exactly one" },
  { arrow: "|o--o{", description: "Zero or one to zero or many" },
  { arrow: "}o--o{", description: "Zero or many to zero or many" },
  { arrow: "}|--|{", description: "One or many to one or many" },
  { arrow: "||..o{", description: "Non-identifying: one to zero or many" },
  { arrow: "--", description: "Plain link" },
];

const STATE_ARROWS: ArrowFact[] = [
  { arrow: "-->", description: "Transition (vertical layout)" },
  { arrow: "->", description: "Transition (horizontal layout)" },
  { arrow: "-left->", description: "Transition drawn to the left" },
  { arrow: "-right->", description: "Transition drawn to the right" },
  { arrow: "-up->", description: "Transition drawn upwards" },
  { arrow: "-down->", description: "Transition drawn downwards" },
  { arrow: "-[#red,dashed]->", description: "Styled transition" },
];

const DESCRIPTION_ARROWS: ArrowFact[] = [
  { arrow: "-->", description: "Directed link (vertical layout)" },
  { arrow: "->", description: "Directed link (horizontal layout)" },
  { arrow: "--", description: "Plain link" },
  { arrow: "..>", description: "Dependency / uses" },
  { arrow: ".>", description: "Dotted link (include, extend), horizontal" },
  { arrow: "<|--", description: "Generalization: right specialises left" },
  { arrow: "-left->", description: "Link drawn to the left" },
  { arrow: "-right->", description: "Link drawn to the right" },
  { arrow: "-up->", description: "Link drawn upwards" },
  { arrow: "-down->", description: "Link drawn downwards" },
  { arrow: "-[hidden]-", description: "Invisible link, for layout only" },
];

const ARROWS: Partial<Record<DiagramKind, ArrowFact[]>> = {
  sequence: SEQUENCE_ARROWS,
  class: CLASS_ARROWS,
  object: CLASS_ARROWS,
  er: [...ER_ARROWS, ...CLASS_ARROWS.filter((a) => a.arrow !== "--")],
  state: STATE_ARROWS,
  usecase: DESCRIPTION_ARROWS,
  component: DESCRIPTION_ARROWS,
  deployment: DESCRIPTION_ARROWS,
  archimate: DESCRIPTION_ARROWS,
  "activity-legacy": [
    { arrow: "-->", description: "Flow to the next activity" },
    { arrow: "->", description: "Flow, horizontal layout" },
    { arrow: "-up->", description: "Flow drawn upwards" },
    { arrow: "-left->", description: "Flow drawn to the left" },
    { arrow: "-right->", description: "Flow drawn to the right" },
  ],
  timing: [
    { arrow: "->", description: "Message between participants" },
    { arrow: "<->", description: "Constraint between two instants" },
  ],
  gantt: [{ arrow: "->", description: "Dependency: the right task follows the left" }],
  chen: [
    { arrow: "-1-", description: "Participation with cardinality 1" },
    { arrow: "-N-", description: "Participation with cardinality N" },
    { arrow: "=1=", description: "Total participation, cardinality 1" },
    { arrow: "=N=", description: "Total participation, cardinality N" },
    { arrow: "->-", description: "Subclass: left is the parent" },
    { arrow: "-<-", description: "Superclass: left is the child" },
  ],
  nwdiag: [{ arrow: "--", description: "Direct link between two nodes" }],
  unknown: [...SEQUENCE_ARROWS.slice(0, 2), ...CLASS_ARROWS.slice(0, 9)],
};

export function arrowsFor(kind: DiagramKind): ArrowFact[] {
  return ARROWS[kind] ?? [];
}

/**
 * Statement openers per diagram kind, most used first. Multi-word entries are
 * offered as one item. Element types and the dialect's remaining keywords are
 * appended after these by the completion engine.
 */
const COMMON_OPENERS = ["title", "note", "skinparam", "hide", "show", "legend", "caption", "header", "footer", "scale", "newpage"];

const CLASS_OPENERS = [
  "class", "abstract class", "interface", "enum", "annotation", "struct", "entity", "exception", "object", "map",
  "json", "package", "namespace", "together", "note left of", "note right of", "note top of", "note bottom of",
  "hide empty members", "hide circle", "left to right direction", "top to bottom direction",
];

const DESCRIPTION_OPENERS = [
  "actor", "usecase", "component", "interface", "node", "database", "cloud", "package", "rectangle", "artifact",
  "folder", "frame", "queue", "storage", "agent", "card", "file", "stack", "person", "boundary", "control", "entity",
  "collections", "hexagon", "process", "label", "port", "together", "note left of", "note right of", "note top of",
  "note bottom of", "left to right direction", "top to bottom direction",
];

const OPENERS: Partial<Record<DiagramKind, string[]>> = {
  sequence: [
    "participant", "actor", "boundary", "control", "entity", "database", "collections", "queue", "activate",
    "deactivate", "destroy", "create", "return", "note left of", "note right of", "note over", "alt", "else", "opt",
    "loop", "par", "break", "critical", "group", "end", "ref over", "box", "end box", "autonumber", "autoactivate on",
    "hide footbox", "hide unlinked", "newpage",
  ],
  class: CLASS_OPENERS,
  object: ["object", "map", "json", ...CLASS_OPENERS.filter((w) => !["object", "map", "json"].includes(w))],
  er: ["entity", ...CLASS_OPENERS.filter((w) => w !== "entity")],
  usecase: DESCRIPTION_OPENERS,
  component: ["component", "interface", "package", "node", "database", "cloud", ...DESCRIPTION_OPENERS.filter((w) => !["component", "interface", "package", "node", "database", "cloud"].includes(w))],
  deployment: ["node", "database", "artifact", "cloud", "component", ...DESCRIPTION_OPENERS.filter((w) => !["node", "database", "artifact", "cloud", "component"].includes(w))],
  archimate: ["archimate", "rectangle", ...DESCRIPTION_OPENERS.filter((w) => w !== "rectangle")],
  state: [
    "state", "note left of", "note right of", "hide empty description", "left to right direction",
    "top to bottom direction",
  ],
  activity: [
    "start", "stop", "end", "if", "elseif", "else", "endif", "while", "endwhile", "repeat", "repeat while", "backward",
    "fork", "fork again", "end fork", "end merge", "split", "split again", "end split", "switch", "case", "endswitch",
    "partition", "group", "end group", "kill", "detach", "break", "note left", "note right", "floating note left",
  ],
  "activity-legacy": ["if", "else", "endif", "partition", "note left", "note right"],
  timing: [
    "robust", "concise", "clock", "binary", "analog", "highlight", "scale", "hide time-axis", "mode compact",
    "use date format",
  ],
  gantt: [
    "project starts", "printscale daily", "printscale weekly", "printscale monthly", "printscale quarterly",
    "printscale yearly", "saturday are closed", "sunday are closed", "today is", "then", "language",
    "hide footbox", "hide resources names", "hide resources footbox",
  ],
  mindmap: ["left side", "right side"],
  wbs: [],
  nwdiag: ["nwdiag", "network", "group", "address", "color", "description"],
  chen: ["entity", "relationship", "left to right direction"],
  unknown: [
    "participant", "actor", "class", "interface", "enum", "state", "usecase", "component", "node", "database", "start",
    "note left of", "note right of",
  ],
};

export function openersFor(kind: DiagramKind): string[] {
  return [...(OPENERS[kind] ?? []), ...COMMON_OPENERS];
}

export interface CreoleTag {
  label: string;
  snippet: string;
  description: string;
}

export const CREOLE_TAGS: CreoleTag[] = [
  { label: "<b>", snippet: "<b>${1:text}</b>", description: "Bold" },
  { label: "<i>", snippet: "<i>${1:text}</i>", description: "Italic" },
  { label: "<u>", snippet: "<u>${1:text}</u>", description: "Underline" },
  { label: "<s>", snippet: "<s>${1:text}</s>", description: "Strike through" },
  { label: "<w>", snippet: "<w>${1:text}</w>", description: "Wavy underline" },
  { label: "<color:>", snippet: "<color:${1:red}>${2:text}</color>", description: "Text colour" },
  { label: "<back:>", snippet: "<back:${1:yellow}>${2:text}</back>", description: "Background colour" },
  { label: "<size:>", snippet: "<size:${1:18}>${2:text}</size>", description: "Font size" },
  { label: "<font:>", snippet: "<font:${1:monospaced}>${2:text}</font>", description: "Font family" },
  { label: "<sub>", snippet: "<sub>${1:text}</sub>", description: "Subscript" },
  { label: "<sup>", snippet: "<sup>${1:text}</sup>", description: "Superscript" },
  { label: "<&icon>", snippet: "<&${1:check}>", description: "OpenIconic icon" },
  { label: "<:emoji:>", snippet: "<:${1:smile}:>", description: "Emoji" },
  { label: "<$sprite>", snippet: "<\\$${1:sprite}>", description: "Sprite defined with `sprite`" },
];

export const PRAGMAS: { name: string; description: string }[] = [
  { name: "teoz true", description: "Use the Teoz layout engine for sequence diagrams" },
  { name: "useVerticalIf on", description: "Lay out activity if/elseif chains vertically" },
  { name: "layout smetana", description: "Use the built-in Smetana layout engine instead of Graphviz" },
  { name: "layout elk", description: "Use the ELK layout engine" },
  { name: "useNewPackage", description: "Use the newer package rendering" },
  { name: "svgSize 100%", description: "Control the size attributes of SVG output" },
];

/** Value suggestions for skinparams and style properties, by name suffix. */
export function valueChoices(name: string): string[] | "color" | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith("color")) return "color";
  if (lower.endsWith("fontstyle")) return ["plain", "bold", "italic", "bold italic"];
  if (lower.endsWith("fontweight")) return ["normal", "bold"];
  if (lower.endsWith("alignment") || lower.endsWith("align")) return ["left", "center", "right"];
  if (lower.endsWith("linestyle")) return ["solid", "dashed", "dotted"];
  if (lower === "linetype") return ["ortho", "polyline"];
  if (lower.endsWith("stereotypeposition")) return ["top", "bottom"];
  if (lower === "monochrome") return ["true", "false", "reverse"];
  if (lower === "handwritten" || lower.endsWith("shadowing") || lower === "responsemessagebelowarrow" || lower === "showstereotype") {
    return ["true", "false"];
  }
  if (lower === "style") return ["strictuml"];
  return undefined;
}
