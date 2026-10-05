/**
 * Block-structure model: which lines open, continue or close a nesting
 * construct, across every PlantUML dialect. Folding, formatting and the
 * structural diagnostics are all derived from this one analysis.
 *
 * The opener/closer facts mirror PlantUML's own command patterns, including
 * its leniency: `end` closes any sequence group, `end group` closes an
 * activity group, a note without `: text` runs until `end note`, and so on.
 * Where the model cannot be sure (preprocessor branches that open or close
 * constructs, dialects it does not parse) it says so instead of guessing:
 * `StructureBlock.balanced` is false and no issue is reported.
 */

/** How a diagram block's body is analysed. */
export type Dialect =
  /** `@startuml`: full command analysis. */
  | "uml"
  /** Salt wireframes: nesting by `{` / `}` counts. */
  | "salt"
  /** JSON data: nesting by brackets outside strings. */
  | "json"
  /** nwdiag, Chen ER: `name {` … `}` blocks only. */
  | "braces"
  /** Mindmap, WBS: depth comes from markers and indentation; never re-indented. */
  | "tree"
  /** Gantt, chronology: line-oriented statements; never re-indented. */
  | "lines"
  /** YAML, ditaa, dot, EBNF, regex, math, latex…: not analysed at all. */
  | "opaque";

/**
 * Which statement set an `@startuml` body uses. "general" is the default and
 * includes the sequence grouping keywords; "structural" is class, state,
 * component and similar diagrams, where `group` or `loop` can only be names.
 */
export type UmlFamily = "general" | "structural" | "activity" | "legacy-activity";

export type LineRole =
  /** Outside every `@start…/@end…` block. */
  | "outside"
  /** The `@start…` or `@end…` line itself. */
  | "tag"
  /** A statement whose leading whitespace is free. */
  | "code"
  /** Inside a multi-line text body: only a uniform shift of its whole group is safe. */
  | "text"
  /** Must be left byte-for-byte: block comments, continuation lines, unparsed dialects. */
  | "verbatim";

export interface LineInfo {
  role: LineRole;
  /** Nesting depth in indent units; meaningful for `code` lines. */
  depth: number;
  /** Index into `DocumentStructure.groups` for `text` lines, else -1. */
  group: number;
  /** Index into `DocumentStructure.blocks`, or -1 outside every block. */
  block: number;
}

/** Lines of one text body that must keep their indentation relative to each other. */
export interface TextGroup {
  depth: number;
  lines: number[];
}

export interface StructureBlock {
  /** Tag without the `@start` prefix, lower-cased. Empty for an implicit block. */
  tag: string;
  startLine: number;
  /** Line of the `@end…` tag, or the last line the block reaches. */
  endLine: number;
  /** How the block ended: its own `@end…`, the next `@start…`, or the end of the document. */
  closedBy: "end" | "start" | "eof";
  /** Tag of the closing `@end…` line, lower-cased, when closedBy is "end". */
  endTag: string | null;
  /** True for a document without any `@start…` tag, analysed as one UML block. */
  implicit: boolean;
  dialect: Dialect;
  family: UmlFamily | null;
  /** Every construct in the block is closed and nothing looked suspicious. */
  balanced: boolean;
  /** The preprocessor (or an engine-version difference) makes the structure unknowable. */
  uncertain: boolean;
  /** The block includes files from outside the standard library, which may define or open anything. */
  external: boolean;
}

export type ConstructKind =
  | "seq-group"
  | "box"
  | "if"
  | "switch"
  | "while"
  | "repeat"
  | "fork"
  | "split"
  | "group"
  | "partition"
  | "state"
  | "brace"
  | "members"
  | "json"
  | "skinparam"
  | "style"
  | "note"
  | "text"
  | "label"
  | "sprite"
  | "comment"
  | "pp-if"
  | "pp-def"
  | "pp-loop"
  | "pp-sub";

export interface Construct {
  kind: ConstructKind;
  /** Opening keyword as written, for messages: "alt", "if", "note", "package", "!if". */
  keyword: string;
  openLine: number;
  /** Columns of the opening keyword on openLine (end exclusive). */
  openStart: number;
  openEnd: number;
  /** Lines of `else`, `elseif`, `also`, `case`, `fork again`, `split again`, `!else`… */
  midLines: number[];
  /** Line of the closer, or -1 when never closed. */
  closeLine: number;
  /** Canonical closer text, for messages and quick fixes. */
  closer: string;
  /** Nesting depth of the opening line. */
  depth: number;
  /** Index of the enclosing construct, or -1. */
  parent: number;
  block: number;
}

export interface StructureIssue {
  kind: "unclosed" | "stray-closer" | "stray-branch";
  line: number;
  startColumn: number;
  endColumn: number;
  /** The opener (unclosed) or the stray keyword. */
  keyword: string;
  /** What should close it (unclosed) or what it should belong to (stray). */
  expected: string;
  /** Index of the construct, for `unclosed`. */
  construct: number;
  /** For `unclosed`: the line before which the missing closer belongs; -1 otherwise. */
  insertBefore: number;
  block: number;
}

export interface DocumentStructure {
  lines: LineInfo[];
  blocks: StructureBlock[];
  constructs: Construct[];
  groups: TextGroup[];
  /** Problems worth showing to the user; empty for blocks marked uncertain. */
  issues: StructureIssue[];
  /** `@end…` lines that close nothing. */
  strayEndLines: number[];
}

// Case-sensitive, like the engine: `@Ender` (a timing-diagram player) is not an end tag.
const START_TAG = /^\s*@start([A-Za-z]*)/;
const END_TAG = /^\s*@end([A-Za-z]*)/;

const TAG_DIALECTS: Record<string, Dialect> = {
  uml: "uml",
  salt: "salt",
  json: "json",
  nwdiag: "braces",
  chen: "braces",
  mindmap: "tree",
  wbs: "tree",
  gantt: "lines",
  chronology: "lines",
};

/** Element keywords that accept a multi-line `[ … ]` or `as " … "` description. */
const DESCRIBED_ELEMENT =
  /^(?:participant|archimate|person|artifact|actor\/?|folder|card|file|package|rectangle|hexagon|label|node|frame|cloud|action|process|database|queue|stack|storage|agent|usecase\/?|component|boundary|control|entity|interface|circle|collections|port|portin|portout)\s/i;

/** Element keywords whose `{ … }` body is a member list (ended by the first lone `}`), not nested statements. */
const MEMBER_BODY =
  /^(?:[-+#~]\s*)?(?:(?:abstract|static)\s+class|abstract|class|interface|enum|annotation|entity|protocol|struct|exception|metaclass|stereotype|dataclass|record|object|map)\s.*\{$/i;

const SEQ_GROUP = /^(?:&\s*)?(opt|alt|loop|par2|par|break|critical|group|partition)(?=$|\s|#)/i;
/** A first token made only of arrow characters means the keyword is really an element name. */
const ARROW_TOKEN = /^[-.<>=*o#x+^|\\/[\]]*(?:--|\.\.|->|<-)[-.<>=*o#x+^|\\/[\]]*(?:\s|$)/;

const NOTE_HEAD = /^(?:&\s*)?(?:\/\s*)?(?:floating\s+)?([hr]?note)(?=$|\s|<<|#|\{)/i;
const NOTE_SHAPE = /^(?:$|(?:left|right|top|bottom|over|across|accross|as|on|of)\b|<<|#|\{)/i;
const NOTE_END = /^end\s?[hr]?note$/i;
const STRAY_TEXT_END = /^end\s?(?:[hr]?note|legend|title|header|footer|caption|ref|sprite)$/i;

/** Inline colour spec, whose `line:red`-style parts hold colons that are not label separators. */
const COLOR_SPEC =
  /#(?:\w+[-\\|/]?\w+;)?(?:(?:text|back|header|line\.dashed|line\.dotted|line\.bold|line|shadowing)(?::\w+[-\\|/]?\w+)?(?:;|(?![\w;:.])))+/gi;

/** Statements only class, state and description diagrams have. */
const STRUCTURAL_EVIDENCE =
  /^(?:(?:abstract\s+)?class|interface|enum|annotation|struct|exception|protocol|metaclass|state|object|map|usecase|component|package|namespace|node|rectangle|folder|frame|cloud|card|artifact|storage|hexagon|person|agent|stack|file|label)\s|^\[\*\]/i;

/** Remove what could hide or fake structure: inline comments, strings, stereotypes, links, colour specs. */
function mask(text: string): string {
  return text
    .replace(/\/'.*?'\//g, " ")
    .replace(/"[^"]*"/g, '""')
    .replace(/<<.*?>>/g, "<<>>")
    .replace(/\[\[.*?\]\]/g, "[[]]")
    .replace(COLOR_SPEC, "#")
    .trim();
}

/** True when what follows a keyword shows it is an element name in a relationship or a member line. */
function looksLikeRelationship(rest: string): boolean {
  return rest.startsWith(":") || ARROW_TOKEN.test(rest.replace(/^""\s*/, ""));
}

function endsWithSingleBackslash(line: string): boolean {
  return line.endsWith("\\") && !line.endsWith("\\\\");
}

/** True when the masked line holds a `:` that separates a label (and is not part of `::`). */
function hasLabelColon(masked: string): boolean {
  return /(?:^|[^:]):(?!:)/.test(masked);
}

/** A multi-line activity label ends on `;` (optionally followed by stereotypes or a link). */
const LABEL_END_SEMICOLON = /;\s*(?:<<[^<>]*>>\s*)*(?:\[\[.*\]\])?$/;

/**
 * Older engines (including 1.2026.1) also end an activity label on the SDL
 * shape suffixes `| < > / ] }`, unless the suffix looks like creole markup.
 */
function endsWithLegacyLabelTerminator(text: string): boolean {
  const last = text.charAt(text.length - 1);
  const before = text.slice(0, -1);
  const previous = before.charAt(before.length - 1);
  if (last === "|") return !before.includes("|");
  if (last === ">") {
    return previous !== ">" && !/<\/?\w{1,5}$/.test(before) && !/<img[^>]*$/.test(before) && !/<[&$]\w+$/.test(before);
  }
  if (last === "/" || last === "<" || last === "}" || last === "]") return !"/|<>}]".includes(previous);
  return false;
}

function firstWord(text: string): string {
  return /^[!@]?[\w$]+|^\S/.exec(text)?.[0] ?? "";
}

interface Logical {
  /** First physical line. */
  line: number;
  /** Last physical line (greater than `line` when lines end with a backslash). */
  last: number;
  /** Joined text, trimmed. */
  text: string;
}

type Body =
  | {
      kind: "text";
      construct: number;
      group: number;
      depth: number;
      isEnd: (text: string) => boolean;
      /** True when the closing line carries text and so belongs to the group. */
      closerInGroup: (text: string) => boolean;
    }
  | {
      kind: "counted";
      construct: number;
      depth: number;
      /** Open brackets inside the body, not counting the opener's own. */
      count: number;
      json: boolean;
      /** Set for `<style>`: the body ends on this pattern instead of on its own `}`. */
      endPattern: RegExp | null;
    };

interface PreprocFrame {
  construct: number;
  kind: "pp-if" | "pp-def" | "pp-loop" | "pp-sub";
  /** Diagram stack when the frame opened. */
  snapshot: number[];
  /** Stack signature at the end of each branch of an `!if`. */
  branches: string[];
  sawElse: boolean;
  /** Floor to restore when a definition body ends. */
  previousFloor: number;
  /** True when the frame raised the floor, so its body has a stack of its own. */
  isolated: boolean;
  /** Construct of the text body that was open when the frame opened, or -1. */
  bodyConstruct: number;
}

interface PassResult {
  lines: Map<number, LineInfo>;
  constructs: Construct[];
  groups: TextGroup[];
  issues: StructureIssue[];
  balanced: boolean;
  uncertain: boolean;
  /** The block pulls in files that may open or close constructs of their own. */
  external: boolean;
  /** Set when a "general" pass met syntax that only another family has. */
  switchTo: UmlFamily | null;
}

function activityEvidence(text: string): boolean {
  return (
    /^(?:start|stop);?$/i.test(text) ||
    /^(?:#\S+\s*)?:.*;\s*(?:<<[^<>]*>>\s*)*$/.test(text) ||
    /^(?:#\S+\s*)?:[^:]*$/.test(text) ||
    /^(?:#\w+:\s*)?(?:if|while|switch)\s*\(.*\)/i.test(text) ||
    /^(?:else\s*if|elseif|case)\s*\(/i.test(text) ||
    /^repeat(?:\s*:.*;)?$/i.test(text) ||
    /^repeat\s*while\b/i.test(text) ||
    /^(?:fork|split)(?:\s+again)?;?$/i.test(text) ||
    /^end\s*(?:fork|merge|while|split|switch);?$/i.test(text) ||
    /^\|[^|]+\|[^|]*$/.test(text)
  );
}

function legacyActivityEvidence(masked: string): boolean {
  return /^\(\*(?:top)?\)\s*[-.]/.test(masked) || /[-.]+>\s*(?:\[[^\]]*\]\s*)?\(\*(?:top)?\)$/.test(masked);
}

class UmlPass {
  readonly result: PassResult = {
    lines: new Map(),
    constructs: [],
    groups: [],
    issues: [],
    balanced: true,
    uncertain: false,
    external: false,
    switchTo: null,
  };

  private stack: number[] = [];
  /** Closers never reach below this index: a definition body is its own world. */
  private floor = 0;
  private preproc: PreprocFrame[] = [];
  private body: Body | null = null;
  private comment = -1;
  /** A sequence grouping keyword was taken as such; wrong if the diagram turns out to be structural. */
  private usedSequenceKeyword = false;
  private structural: boolean;
  /** Line just past the block body. */
  private end = 0;

  constructor(
    private readonly lines: readonly string[],
    private readonly blockIndex: number,
    private readonly family: UmlFamily,
    private readonly mode: "uml" | "braces" | "common",
  ) {
    this.structural = family === "structural";
  }

  run(first: number, last: number): PassResult {
    this.end = last + 1;
    for (const logical of this.logicalLines(first, last)) {
      this.visit(logical);
      if (this.result.switchTo) return this.result;
    }
    this.finish();
    return this.result;
  }

  private *logicalLines(first: number, last: number): Generator<Logical> {
    for (let i = first; i <= last; i++) {
      const start = i;
      let text = this.lines[i];
      while (endsWithSingleBackslash(text) && i < last) {
        i++;
        text = text.slice(0, -1) + this.lines[i];
      }
      yield { line: start, last: i, text: text.trim() };
    }
  }

  private get depth(): number {
    let depth = this.stack.length;
    for (const frame of this.preproc) if (frame.kind !== "pp-sub") depth++;
    return depth;
  }

  private setLine(logical: Logical, requestedRole: LineRole, depth: number, requestedGroup = -1): void {
    // A procedure, function or `!definelong` body is a text template: wherever it is expanded
    // (possibly inside a note or a class body) its lines arrive with their indentation.
    const template = this.preproc.some((frame) => frame.kind === "pp-def");
    const role = template ? "verbatim" : requestedRole;
    const group = template ? -1 : requestedGroup;
    this.result.lines.set(logical.line, { role, depth, group, block: this.blockIndex });
    // Continuation lines are merged raw by the engine, leading whitespace included.
    for (let i = logical.line + 1; i <= logical.last; i++) {
      this.result.lines.set(i, { role: "verbatim", depth: 0, group: -1, block: this.blockIndex });
    }
    if (group >= 0) this.result.groups[group].lines.push(logical.line);
  }

  private keywordRange(line: number, keyword: string): [number, number] {
    const raw = this.lines[line];
    const indent = raw.length - raw.trimStart().length;
    const at = raw.toLowerCase().indexOf(keyword.toLowerCase(), indent);
    const start = at < 0 ? indent : at;
    return [start, start + Math.max(keyword.length, 1)];
  }

  private newConstruct(kind: ConstructKind, keyword: string, closer: string, line: number, depth: number): number {
    const [openStart, openEnd] = this.keywordRange(line, keyword);
    const parent = this.stack.length > this.floor ? this.stack[this.stack.length - 1] : -1;
    this.result.constructs.push({
      kind,
      keyword,
      openLine: line,
      openStart,
      openEnd,
      midLines: [],
      closeLine: -1,
      closer,
      depth,
      parent,
      block: this.blockIndex,
    });
    return this.result.constructs.length - 1;
  }

  private open(kind: ConstructKind, keyword: string, closer: string, logical: Logical): number {
    const depth = this.depth;
    const index = this.newConstruct(kind, keyword, closer, logical.line, depth);
    this.setLine(logical, "code", depth);
    this.stack.push(index);
    return index;
  }

  private issue(
    kind: StructureIssue["kind"],
    line: number,
    keyword: string,
    expected: string,
    construct = -1,
    insertBefore = -1,
  ): void {
    this.result.balanced = false;
    // A definition body is replayed elsewhere, so what looks unbalanced here may not be.
    if (this.preproc.some((frame) => frame.kind === "pp-def")) return;
    const [startColumn, endColumn] =
      construct >= 0
        ? [this.result.constructs[construct].openStart, this.result.constructs[construct].openEnd]
        : this.keywordRange(line, keyword);
    this.result.issues.push({
      kind,
      line,
      startColumn,
      endColumn,
      keyword,
      expected,
      construct,
      insertBefore,
      block: this.blockIndex,
    });
  }

  /** `before` is the line that forced the construct shut: a closer for something outside it, or the block's end. */
  private reportUnclosed(index: number, before: number): void {
    const construct = this.result.constructs[index];
    this.issue("unclosed", construct.openLine, construct.keyword, construct.closer, index, before);
  }

  /** Nearest open construct of one of the kinds, searching down to the floor. */
  private find(kinds: readonly ConstructKind[]): number {
    for (let i = this.stack.length - 1; i >= this.floor; i--) {
      if (kinds.includes(this.result.constructs[this.stack[i]].kind)) return i;
    }
    return -1;
  }

  private close(kinds: readonly ConstructKind[], keyword: string, expected: string, logical: Logical): void {
    const at = this.find(kinds);
    if (at < 0) {
      this.setLine(logical, "code", this.depth);
      this.issue("stray-closer", logical.line, keyword, expected);
      return;
    }
    while (this.stack.length - 1 > at) this.reportUnclosed(this.stack.pop()!, logical.line);
    const index = this.stack.pop()!;
    this.result.constructs[index].closeLine = logical.line;
    this.setLine(logical, "code", this.depth);
  }

  private branch(kinds: readonly ConstructKind[], keyword: string, expected: string, logical: Logical): void {
    const at = this.find(kinds);
    if (at < 0) {
      this.setLine(logical, "code", this.depth);
      this.issue("stray-branch", logical.line, keyword, expected);
      return;
    }
    while (this.stack.length - 1 > at) this.reportUnclosed(this.stack.pop()!, logical.line);
    const construct = this.result.constructs[this.stack[at]];
    construct.midLines.push(logical.line);
    this.setLine(logical, "code", this.depth - 1);
  }

  /** Open a text body. `rigid` puts the opening line into the group, for bodies whose first line is text. */
  private openText(
    kind: ConstructKind,
    keyword: string,
    closer: string,
    logical: Logical,
    isEnd: (text: string) => boolean,
    options: { rigid?: boolean; closerInGroup?: (text: string) => boolean } = {},
  ): void {
    const depth = this.depth;
    const construct = this.newConstruct(kind, keyword, closer, logical.line, depth);
    const rigid = options.rigid ?? false;
    this.result.groups.push({ depth: rigid ? depth : depth + 1, lines: [] });
    const group = this.result.groups.length - 1;
    if (rigid) this.setLine(logical, "text", depth, group);
    else this.setLine(logical, "code", depth);
    this.stack.push(construct);
    this.body = { kind: "text", construct, group, depth, isEnd, closerInGroup: options.closerInGroup ?? (() => rigid) };
  }

  private closeBody(logical: Logical): void {
    const index = this.stack.pop()!;
    this.result.constructs[index].closeLine = logical.line;
    this.body = null;
  }

  private visit(logical: Logical): void {
    const text = logical.text;

    if (this.comment >= 0) {
      this.setLine(logical, "verbatim", 0);
      if (text.endsWith("'/")) {
        this.result.constructs[this.comment].closeLine = logical.last;
        this.comment = -1;
      }
      return;
    }
    if (text.startsWith("/'") && !text.includes("'/")) {
      this.comment = this.newConstruct("comment", "/'", "'/", logical.line, this.depth);
      this.setLine(logical, "verbatim", 0);
      return;
    }

    const body = this.body;
    if (text.startsWith("!") && this.visitPreprocessor(logical)) return;

    if (body) {
      this.visitBody(body, logical);
      return;
    }
    if (text === "" || text.startsWith("'")) {
      this.setLine(logical, "code", this.depth);
      return;
    }
    if (text.startsWith("!")) {
      this.setLine(logical, "code", this.depth);
      return;
    }
    this.visitCommand(logical);
  }

  private visitBody(body: Body, logical: Logical): void {
    const text = logical.text;
    if (body.kind === "text") {
      if (text !== "" && body.isEnd(text)) {
        if (body.closerInGroup(text)) this.setLine(logical, "text", body.depth, body.group);
        else this.setLine(logical, "code", body.depth);
        this.closeBody(logical);
      } else {
        this.setLine(logical, "text", body.depth + 1, body.group);
      }
      return;
    }
    if (body.endPattern?.test(text)) {
      this.setLine(logical, "code", body.depth);
      this.closeBody(logical);
      return;
    }
    const [leadingClosers, delta] = bracketDelta(text, body.json);
    const inner = Math.max(body.count - leadingClosers, 0);
    body.count += delta;
    if (!body.endPattern && body.count < 0) {
      this.setLine(logical, "code", body.depth);
      this.closeBody(logical);
      return;
    }
    body.count = Math.max(body.count, 0);
    this.setLine(logical, "code", this.depth + inner);
  }

  /** Returns false when the line is not a structural directive and should be handled as plain text. */
  private visitPreprocessor(logical: Logical): boolean {
    const text = logical.text;
    const inBody = this.body !== null;
    const place = (depth: number) => {
      if (this.body?.kind === "text") this.setLine(logical, "text", this.body.depth + 1, this.body.group);
      else this.setLine(logical, "code", depth);
    };
    const push = (kind: PreprocFrame["kind"], keyword: string, closer: string) => {
      const depth = this.depth;
      const construct = this.newConstruct(kind, keyword, closer, logical.line, depth);
      place(depth);
      const frame: PreprocFrame = {
        construct,
        kind,
        snapshot: this.stack.slice(),
        branches: [],
        sawElse: false,
        previousFloor: this.floor,
        // A text body cannot be suspended, so a definition opened inside one is left alone.
        isolated: kind === "pp-def" && !inBody,
        bodyConstruct: this.body?.construct ?? -1,
      };
      this.preproc.push(frame);
      if (frame.isolated) this.floor = this.stack.length;
    };
    const sameBody = (frame: PreprocFrame) => (this.body?.construct ?? -1) === frame.bodyConstruct;
    const findFrame = (kind: PreprocFrame["kind"]) => {
      for (let i = this.preproc.length - 1; i >= 0; i--) if (this.preproc[i].kind === kind) return i;
      return -1;
    };
    const signature = () => this.stack.map((index) => this.result.constructs[index].kind).join(",");
    const sameAsSnapshot = (frame: PreprocFrame) =>
      frame.snapshot.length === this.stack.length && frame.snapshot.every((index, i) => this.stack[i] === index);
    const pop = (kind: PreprocFrame["kind"], keyword: string, expected: string) => {
      const at = findFrame(kind);
      if (at < 0) {
        place(this.depth);
        this.issue("stray-closer", logical.line, keyword, expected);
        return;
      }
      while (this.preproc.length - 1 > at) this.reportUnclosed(this.preproc.pop()!.construct, logical.line);
      const frame = this.preproc.pop()!;
      this.result.constructs[frame.construct].closeLine = logical.line;
      if (kind === "pp-if") {
        frame.branches.push(signature());
        if (!frame.sawElse) frame.branches.push(frame.snapshot.map((index) => this.result.constructs[index].kind).join(","));
        if (frame.branches.some((branch) => branch !== frame.branches[0]) || !sameBody(frame)) this.result.uncertain = true;
      } else if (kind === "pp-loop") {
        if (!sameAsSnapshot(frame) || !sameBody(frame)) this.result.uncertain = true;
      } else if (frame.isolated) {
        // A macro that leaves a construct open hands the closing to its callers.
        if (this.stack.length > this.floor) this.result.uncertain = true;
        this.stack.length = this.floor;
        this.floor = frame.previousFloor;
        this.body = null;
      }
      place(this.depth);
    };

    if (/^!(?:if|ifdef|ifndef)\b/i.test(text)) {
      push("pp-if", firstWord(text), "!endif");
    } else if (/^!(?:else|elseif)\b/i.test(text)) {
      const at = findFrame("pp-if");
      if (at < 0) {
        place(this.depth);
        this.issue("stray-branch", logical.line, firstWord(text), "!if");
        return true;
      }
      while (this.preproc.length - 1 > at) this.reportUnclosed(this.preproc.pop()!.construct, logical.line);
      const frame = this.preproc[at];
      frame.branches.push(signature());
      if (/^!else\b/i.test(text)) frame.sawElse = true;
      // Every branch starts from the state the `!if` started from; a text body cannot be rewound.
      if (!sameBody(frame)) this.result.uncertain = true;
      this.stack = frame.snapshot.slice();
      this.result.constructs[frame.construct].midLines.push(logical.line);
      place(this.depth - 1);
    } else if (/^!endif\b/i.test(text)) {
      pop("pp-if", "!endif", "!if");
    } else if (/^!(?:(?:unquoted|final)\s+)*function\s/i.test(text)) {
      // `!function $f($x) !return $x + 1` is complete on one line.
      if (/\)\s*!return\b/i.test(text)) place(this.depth);
      else push("pp-def", "!function", "!endfunction");
    } else if (/^!(?:(?:unquoted|final)\s+)*procedure\s/i.test(text)) {
      push("pp-def", "!procedure", "!endprocedure");
    } else if (/^!definelong\b/i.test(text)) {
      push("pp-def", "!definelong", "!enddefinelong");
    } else if (/^!end\s*(?:function|procedure|definelong)\b/i.test(text)) {
      pop("pp-def", /^!end\s*\w+/i.exec(text)![0], "!procedure, !function or !definelong");
    } else if (/^!while\b/i.test(text)) {
      push("pp-loop", "!while", "!endwhile");
    } else if (/^!foreach\b/i.test(text)) {
      push("pp-loop", "!foreach", "!endfor");
    } else if (/^!(?:endwhile|endfor)\b/i.test(text)) {
      pop("pp-loop", firstWord(text), /^!endwhile/i.test(text) ? "!while" : "!foreach");
    } else if (/^!\s*(?:local\s+|global\s+)?\$?[\p{L}_][\p{L}\d_]*\s*\??=/u.test(text) && !inBody) {
      // `!$data = {` … `}`: a JSON value spread over several lines.
      const [, delta] = bracketDelta(text.slice(text.indexOf("=") + 1), true);
      if (delta <= 0) return false;
      const construct = this.open("json", firstWord(text), "}", logical);
      this.body = { kind: "counted", construct, depth: this.depth - 1, count: delta - 1, json: true, endPattern: null };
    } else if (/^!(?:include|includeurl|includesub|import)\b/i.test(text)) {
      // Only the standard library is known not to open or close constructs across files.
      if (!/^!\w+\s+<[^>]+>/.test(text) && !/plantuml-stdlib\//i.test(text)) this.result.external = true;
      return false;
    } else if (/^!define\s.*\{$/i.test(text)) {
      this.result.uncertain = true;
      return false;
    } else if (/^!startsub\b/i.test(text)) {
      push("pp-sub", "!startsub", "!endsub");
    } else if (/^!endsub\b/i.test(text)) {
      pop("pp-sub", "!endsub", "!startsub");
    } else {
      return false;
    }
    return true;
  }

  private visitCommand(logical: Logical): void {
    const text = logical.text;
    const masked = mask(text);

    if (this.mode === "common") {
      if (!this.visitCommonText(logical, masked)) this.setLine(logical, "verbatim", 0);
      return;
    }
    if (this.mode === "braces") {
      if (masked === "}") this.close(["brace"], "}", "{", logical);
      else if (masked.endsWith("{")) this.open("brace", firstWord(text), "}", logical);
      else this.setLine(logical, "code", this.depth);
      return;
    }

    if (this.family === "general") {
      if (activityEvidence(text)) {
        this.result.switchTo = "activity";
        return;
      }
      if (legacyActivityEvidence(masked)) {
        this.result.switchTo = "legacy-activity";
        return;
      }
      if (STRUCTURAL_EVIDENCE.test(masked)) {
        if (this.usedSequenceKeyword) {
          this.result.switchTo = "structural";
          return;
        }
        this.structural = true;
      }
    }

    if (this.visitCommonText(logical, masked)) return;

    if (/^skinparam(?:locked)?\b.*\{$/i.test(masked)) {
      const construct = this.open("skinparam", "skinparam", "}", logical);
      this.body = { kind: "counted", construct, depth: this.depth - 1, count: 0, json: false, endPattern: null };
      return;
    }
    if (masked === "}") {
      this.close(["brace", "partition", "state"], "}", "{", logical);
      return;
    }

    const handled =
      this.family === "activity"
        ? this.visitActivity(logical, masked)
        : this.family === "legacy-activity"
          ? this.visitLegacyActivity(logical, masked)
          : this.visitGeneral(logical, masked);
    if (handled) return;

    if (masked.endsWith("{") && !hasLabelColon(masked)) {
      this.open("brace", firstWord(text), "}", logical);
      return;
    }
    this.setLine(logical, "code", this.depth);
  }

  /** Multi-line text bodies every diagram type shares. */
  private visitCommonText(logical: Logical, masked: string): boolean {
    const text = logical.text;
    if (/^<style>$/i.test(text)) {
      const construct = this.open("style", "<style>", "</style>", logical);
      this.body = { kind: "counted", construct, depth: this.depth - 1, count: 0, json: false, endPattern: /^<\/?style>$/i };
      return true;
    }
    const simple =
      /^(title|caption)$/i.exec(text) ??
      /^(legend)(?:\s+(?:top|bottom))?(?:\s+(?:left|right|center))?$/i.exec(text) ??
      /^(?:(?:left|right|center)\s*)?(header|footer)$/i.exec(text);
    if (simple) {
      const word = simple[1].toLowerCase();
      this.openText("text", word, `end ${word}`, logical, (line) => new RegExp(`^end\\s?${word}$`, "i").test(line));
      return true;
    }

    const note = NOTE_HEAD.exec(text);
    if (note) {
      const rest = masked.slice(note[0].length).trim();
      const quotedDisplay = /^\s*"/.test(text.slice(note[0].length));
      if (NOTE_SHAPE.test(rest) && !quotedDisplay && !hasLabelColon(rest)) {
        const word = note[1].toLowerCase();
        if (rest.endsWith("{")) this.openText("note", word, "}", logical, (line) => line === "}");
        else this.openText("note", word, `end ${word}`, logical, (line) => NOTE_END.test(line));
        return true;
      }
      if (NOTE_SHAPE.test(rest) || quotedDisplay) {
        this.setLine(logical, "code", this.depth);
        return true;
      }
    }

    if (/^ref(?:#\w+)?\s+over\s/i.test(text) && !hasLabelColon(masked)) {
      this.openText("text", "ref", "end ref", logical, (line) => /^end\s?(?:ref)?$/i.test(line));
      return true;
    }
    if (/^sprite\s+\$?[\w.-]+\s*(?:\[[^\]]*\])?\s*\{$/i.test(text)) {
      this.openText("sprite", "sprite", "}", logical, (line) => /^(?:end\s?sprite|\})$/i.test(line));
      return true;
    }
    if (/^sprite\s+\$?[\w.-]+\s+<svg\b/i.test(text) && !/<\/svg>$/i.test(text)) {
      this.openText("sprite", "sprite", "</svg>", logical, (line) => /<\/svg>$/i.test(line), { closerInGroup: () => true });
      return true;
    }
    return false;
  }

  private visitGeneral(logical: Logical, masked: string): boolean {
    const text = logical.text;

    if (/^json\s.*\{$/i.test(masked)) {
      const construct = this.open("json", "json", "}", logical);
      this.body = { kind: "counted", construct, depth: this.depth - 1, count: 0, json: true, endPattern: null };
      return true;
    }
    if (MEMBER_BODY.test(masked)) {
      const keyword = /^(?:[-+#~]\s*)?((?:abstract|static)\s+class|\w+)/i.exec(text)?.[1] ?? "class";
      // Members are creole text: `|_` trees and lists read their own indentation.
      this.openText("members", keyword, "}", logical, (line) => line === "}");
      return true;
    }
    if (DESCRIBED_ELEMENT.test(masked) && !masked.endsWith("{")) {
      if (hasUnclosedBracket(masked)) {
        const archimate = /^archimate\s/i.test(masked);
        this.openText(
          "text",
          firstWord(text),
          "]",
          logical,
          (line) => (archimate ? line.endsWith("]") : /^[^[\]]*\]$/.test(line)),
          { closerInGroup: (line) => line !== "]" },
        );
        return true;
      }
      if (/\bas\s+"[^"]*$/i.test(text) && (text.match(/"/g)?.length ?? 0) % 2 === 1) {
        this.openText("text", firstWord(text), '"', logical, (line) => line.endsWith('"'), {
          closerInGroup: () => true,
        });
        return true;
      }
    }
    if (/^state\b.*\sbegin$/i.test(masked)) {
      this.open("state", "state", "end state", logical);
      return true;
    }
    if (/^end\s?state$/i.test(masked)) {
      this.close(["state", "brace"], "end state", "state", logical);
      return true;
    }
    if (/^end\s*box$/i.test(masked)) {
      this.close(["box"], "end box", "box", logical);
      return true;
    }
    if (this.structural) return false;

    if (/^box(?=$|\s|#)/i.test(masked) && !looksLikeRelationship(masked.slice(3).trim())) {
      this.usedSequenceKeyword = true;
      this.open("box", "box", "end box", logical);
      return true;
    }
    const group = SEQ_GROUP.exec(masked);
    if (group && !masked.endsWith("{") && !looksLikeRelationship(masked.slice(group[0].length).trim())) {
      this.usedSequenceKeyword = true;
      this.open("seq-group", group[1].toLowerCase(), "end", logical);
      return true;
    }
    const branch = /^(else|also)(?=$|\s)/i.exec(masked);
    if (branch && !looksLikeRelationship(masked.slice(branch[0].length).trim())) {
      this.usedSequenceKeyword = true;
      this.branch(["seq-group"], branch[1].toLowerCase(), "alt", logical);
      return true;
    }
    if ((/^end(?=$|\s)/i.test(masked) || STRAY_TEXT_END.test(masked)) && !looksLikeRelationship(masked.slice(3).trim())) {
      this.usedSequenceKeyword = true;
      this.close(["seq-group"], "end", "alt, opt, loop, par, break, critical or group", logical);
      return true;
    }
    return false;
  }

  private visitActivity(logical: Logical, masked: string): boolean {
    const text = logical.text;
    const colour = "(?:#\\w+:\\s*)?";
    const is = (pattern: string) => new RegExp(`^${pattern}`, "i").test(masked);

    if (is(`${colour}if\\s*\\(`)) return this.opened("if", "if", "endif", logical);
    if (is("(?:\\(.*?\\)\\s*)?else\\s*if\\s*\\(") || is("elseif\\s*\\(")) {
      this.branch(["if"], "elseif", "if", logical);
      return true;
    }
    if (is("else(?:$|\\s|\\(|;)")) {
      this.branch(["if"], "else", "if", logical);
      return true;
    }
    if (is("end\\s*if;?$")) return this.closed(["if"], "endif", "if", logical);
    if (is(`${colour}switch\\s*\\(`)) return this.opened("switch", "switch", "endswitch", logical);
    if (is("case\\s*\\(")) {
      this.branch(["switch"], "case", "switch", logical);
      return true;
    }
    if (is("end\\s*switch;?$")) return this.closed(["switch"], "endswitch", "switch", logical);
    if (is("(?:end\\s*while|while\\s*end)(?:$|\\s|\\(|;)")) return this.closed(["while"], "endwhile", "while", logical);
    if (is(`${colour}while\\s*\\(`)) return this.opened("while", "while", "endwhile", logical);
    if (is("repeat\\s*while(?:$|\\s|\\(|;)")) return this.closed(["repeat"], "repeat while", "repeat", logical);
    if (is(`${colour}repeat(?:$|\\s|:|;)`)) return this.opened("repeat", "repeat", "repeat while", logical);
    if (is("fork\\s*again;?$")) {
      this.branch(["fork"], "fork again", "fork", logical);
      return true;
    }
    if (is("(?:end\\s*fork|fork\\s*end|end\\s*merge)(?:$|\\s|\\{|;)")) {
      return this.closed(["fork"], "end fork", "fork", logical);
    }
    if (is("fork;?$")) return this.opened("fork", "fork", "end fork", logical);
    if (is("split\\s*again;?$")) {
      this.branch(["split"], "split again", "split", logical);
      return true;
    }
    if (is("(?:end\\s*split|split\\s*end);?$")) return this.closed(["split"], "end split", "split", logical);
    if (is("split;?$")) return this.opened("split", "split", "end split", logical);
    if (is("(?:end\\s?group|group\\s?end);?$")) return this.closed(["group"], "end group", "group", logical);
    if (STRAY_TEXT_END.test(masked)) return this.closed([], masked, "a multi-line text block", logical);

    const container = /^(partition|package|rectangle|card|group)\s/i.exec(masked);
    if (container && !masked.endsWith("{")) {
      return this.opened("group", container[1].toLowerCase(), "end group", logical);
    }

    // `:label` not finished on its own line, `-> label` and `backward:label` likewise, run until a terminator.
    // `#blue:(B)` is a coloured connector, not a label.
    if (/^(?:#\w+:)?\(\S\);?$/.test(text)) return false;
    const label = /^(?:#\S+\s*)?(?:<<[^<>]*>>\s*)?:/.test(masked) || /^backward\s*:/i.test(masked);
    const arrow = /^-(?:\[[^\]]*\]-?)?>\s*\S/.test(text);
    if (label || arrow) {
      if (LABEL_END_SEMICOLON.test(text)) return false;
      if (label && endsWithLegacyLabelTerminator(text)) {
        // `:label|` is complete for engines up to 1.2026.1 and the start of a longer label after.
        this.result.uncertain = true;
        return false;
      }
      const isEnd = arrow
        ? (line: string) => line.endsWith(";")
        : (line: string) => {
            if (LABEL_END_SEMICOLON.test(line)) return true;
            if (!endsWithLegacyLabelTerminator(line)) return false;
            // Newer engines no longer end a label here; the two disagree from this line on.
            this.result.uncertain = true;
            return true;
          };
      this.openText("label", arrow ? "->" : ":", ";", logical, isEnd, { rigid: true });
      return true;
    }
    return false;
  }

  private visitLegacyActivity(logical: Logical, masked: string): boolean {
    const text = logical.text;
    if (/^(?:.*>\s*(?:\[[^\]]*\]\s*)?)?if(?:\s|")/i.test(masked)) return this.opened("if", "if", "endif", logical);
    if (/^else$/i.test(masked)) {
      this.branch(["if"], "else", "if", logical);
      return true;
    }
    if (/^end\s?if$/i.test(masked)) return this.closed(["if"], "endif", "if", logical);
    if (/^partition\s/i.test(masked) && !masked.endsWith("{")) {
      return this.opened("partition", "partition", "end partition", logical);
    }
    if (/^end\s?partition$/i.test(masked)) {
      return this.closed(["partition", "brace"], "end partition", "partition", logical);
    }
    if (/>\s*(?:\[[^\]]*\]\s*)?"[^"]*$/.test(text) && (text.match(/"/g)?.length ?? 0) % 2 === 1) {
      this.openText("text", '"', '"', logical, (line) => line.includes('"'), { closerInGroup: () => true });
      return true;
    }
    return false;
  }

  private opened(kind: ConstructKind, keyword: string, closer: string, logical: Logical): true {
    this.open(kind, keyword, closer, logical);
    return true;
  }

  private closed(kinds: readonly ConstructKind[], keyword: string, expected: string, logical: Logical): true {
    this.close(kinds, keyword, expected, logical);
    return true;
  }

  private finish(): void {
    if (this.comment >= 0) this.reportUnclosed(this.comment, this.end);
    this.floor = 0;
    while (this.stack.length > 0) this.reportUnclosed(this.stack.pop()!, this.end);
    while (this.preproc.length > 0) this.reportUnclosed(this.preproc.pop()!.construct, this.end);
    if (this.result.uncertain) this.result.balanced = false;
    if (this.result.uncertain || this.result.external) this.result.issues.length = 0;
  }
}

function hasUnclosedBracket(masked: string): boolean {
  let depth = 0;
  for (const char of masked) {
    if (char === "[") depth++;
    else if (char === "]" && depth > 0) depth--;
  }
  return depth > 0;
}

/**
 * Bracket bookkeeping for one line: how many closers lead the line (they
 * dedent it) and the net change in open brackets. With `json`, square
 * brackets count too and string contents are skipped.
 */
function bracketDelta(text: string, json: boolean): [leadingClosers: number, delta: number] {
  let leading = 0;
  let delta = 0;
  let onlyClosersSoFar = true;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      onlyClosersSoFar = false;
    } else if (char === "{" || (json && char === "[")) {
      delta++;
      onlyClosersSoFar = false;
    } else if (char === "}" || (json && char === "]")) {
      delta--;
      if (onlyClosersSoFar) leading++;
    } else if (char !== " " && char !== "\t" && char !== ",") {
      onlyClosersSoFar = false;
    }
  }
  return [leading, delta];
}

/** First statement of a block body, skipping blanks, comments and directives. */
function firstStatement(lines: readonly string[], first: number, last: number): string {
  let inComment = false;
  for (let i = first; i <= last; i++) {
    const text = lines[i].trim();
    if (inComment) {
      if (text.endsWith("'/")) inComment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      if (!text.includes("'/")) inComment = true;
      continue;
    }
    if (text === "" || text.startsWith("'") || text.startsWith("!")) continue;
    return text;
  }
  return "";
}

function resolveDialect(tag: string, lines: readonly string[], first: number, last: number): Dialect {
  const dialect = TAG_DIALECTS[tag] ?? (tag === "" ? "uml" : "opaque");
  if (dialect !== "uml") return dialect;
  const statement = firstStatement(lines, first, last);
  if (/^salt\b/i.test(statement)) return "salt";
  if (/^ditaa\b/i.test(statement) || /^(?:strict\s+)?(?:di)?graph\b.*\{$/i.test(statement)) return "opaque";
  return "uml";
}

/** Salt and JSON bodies nest by bracket counts alone. */
function analyzeCounted(
  lines: readonly string[],
  first: number,
  last: number,
  blockIndex: number,
  json: boolean,
  out: PassResult,
): void {
  const open: number[] = [];
  /** Depth at which a Salt tree widget started; its rows are kept as written. */
  let treeDepth = -1;
  for (let i = first; i <= last; i++) {
    const text = lines[i].trim();
    const [leading] = bracketDelta(text, json);
    const indent = lines[i].length - lines[i].trimStart().length;
    const depth = Math.max(open.length - leading, 0);
    const inTree = treeDepth >= 0 && open.length > treeDepth;
    out.lines.set(i, { role: inTree && depth > treeDepth ? "verbatim" : "code", depth, group: -1, block: blockIndex });

    // Replay the brackets so each multi-line pair becomes a foldable construct.
    let inString = false;
    for (let c = 0; c < text.length; c++) {
      const char = text[c];
      if (inString) {
        if (char === "\\" && json) c++;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{" || (json && char === "[")) {
        out.constructs.push({
          kind: "brace",
          keyword: char,
          openLine: i,
          openStart: indent + c,
          openEnd: indent + c + 1,
          midLines: [],
          closeLine: -1,
          closer: char === "{" ? "}" : "]",
          depth: open.length,
          parent: open.length > 0 ? open[open.length - 1] : -1,
          block: blockIndex,
        });
        open.push(out.constructs.length - 1);
        if (!json && treeDepth < 0 && /^\{T/.test(text.slice(c))) treeDepth = open.length - 1;
      } else if (char === "}" || (json && char === "]")) {
        const index = open.pop();
        if (index === undefined) {
          out.balanced = false;
          out.issues.push({
            kind: "stray-closer",
            line: i,
            startColumn: indent + c,
            endColumn: indent + c + 1,
            keyword: char,
            expected: char === "}" ? "{" : "[",
            construct: -1,
            insertBefore: -1,
            block: blockIndex,
          });
        } else {
          out.constructs[index].closeLine = i;
          if (open.length <= treeDepth) treeDepth = -1;
        }
      }
    }
  }
  for (const index of open) {
    const construct = out.constructs[index];
    out.balanced = false;
    out.issues.push({
      kind: "unclosed",
      line: construct.openLine,
      startColumn: construct.openStart,
      endColumn: construct.openEnd,
      keyword: construct.keyword,
      expected: construct.closer,
      construct: index,
      insertBefore: last + 1,
      block: blockIndex,
    });
  }
}

function emptyResult(): PassResult {
  return {
    lines: new Map(),
    constructs: [],
    groups: [],
    issues: [],
    balanced: true,
    uncertain: false,
    external: false,
    switchTo: null,
  };
}

function analyzeBody(
  lines: readonly string[],
  first: number,
  last: number,
  blockIndex: number,
  dialect: Dialect,
): { result: PassResult; family: UmlFamily | null } {
  if (first > last) return { result: emptyResult(), family: null };
  if (dialect === "uml") {
    let family: UmlFamily = "general";
    let result = new UmlPass(lines, blockIndex, family, "uml").run(first, last);
    if (result.switchTo) {
      family = result.switchTo;
      result = new UmlPass(lines, blockIndex, family, "uml").run(first, last);
    }
    return { result, family };
  }
  if (dialect === "braces") return { result: new UmlPass(lines, blockIndex, "general", "braces").run(first, last), family: null };
  if (dialect === "tree" || dialect === "lines") {
    // Only comments, directives and shared text blocks are recognised, for folding; nothing is re-indented.
    const result = new UmlPass(lines, blockIndex, "general", "common").run(first, last);
    for (const info of result.lines.values()) {
      info.role = "verbatim";
      info.group = -1;
    }
    result.groups.length = 0;
    return { result, family: null };
  }
  const result = emptyResult();
  if (dialect === "salt" || dialect === "json") {
    // Salt inside @startuml starts with a `salt` line, which holds no brackets and so lands at depth 0.
    analyzeCounted(lines, first, last, blockIndex, dialect === "json", result);
  } else {
    for (let i = first; i <= last; i++) result.lines.set(i, { role: "verbatim", depth: 0, group: -1, block: blockIndex });
  }
  return { result, family: null };
}

/** Analyse a whole document. Lines and columns are 0-based. */
export function analyzeStructure(lines: readonly string[]): DocumentStructure {
  const doc: DocumentStructure = {
    lines: lines.map(() => ({ role: "outside", depth: 0, group: -1, block: -1 })),
    blocks: [],
    constructs: [],
    groups: [],
    issues: [],
    strayEndLines: [],
  };

  let open: { tag: string; startLine: number } | null = null;
  const closeBlock = (endLine: number, closedBy: StructureBlock["closedBy"], endTag: string | null) => {
    if (!open) return;
    doc.blocks.push({
      tag: open.tag,
      startLine: open.startLine,
      endLine,
      closedBy,
      endTag,
      implicit: false,
      dialect: "opaque",
      family: null,
      balanced: true,
      uncertain: false,
      external: false,
    });
    open = null;
  };
  lines.forEach((line, i) => {
    const start = START_TAG.exec(line);
    if (start) {
      closeBlock(i - 1, "start", null);
      open = { tag: start[1].toLowerCase(), startLine: i };
      return;
    }
    const end = END_TAG.exec(line);
    if (!end) return;
    if (open) closeBlock(i, "end", end[1].toLowerCase());
    else doc.strayEndLines.push(i);
  });
  closeBlock(lines.length - 1, "eof", null);

  if (doc.blocks.length === 0 && doc.strayEndLines.length === 0 && lines.some((line) => line.trim() !== "")) {
    doc.blocks.push({
      tag: "",
      startLine: 0,
      endLine: lines.length - 1,
      closedBy: "eof",
      endTag: null,
      implicit: true,
      dialect: "uml",
      family: null,
      balanced: true,
      uncertain: false,
      external: false,
    });
  }

  doc.blocks.forEach((block, blockIndex) => {
    const first = block.implicit ? block.startLine : block.startLine + 1;
    const last = block.closedBy === "end" ? block.endLine - 1 : block.endLine;
    if (!block.implicit) doc.lines[block.startLine] = { role: "tag", depth: 0, group: -1, block: blockIndex };
    if (block.closedBy === "end") doc.lines[block.endLine] = { role: "tag", depth: 0, group: -1, block: blockIndex };

    block.dialect = resolveDialect(block.tag, lines, first, last);
    const { result, family } = analyzeBody(lines, first, last, blockIndex, block.dialect);
    block.family = family;
    block.balanced = result.balanced && !result.uncertain;
    block.uncertain = result.uncertain;
    block.external = result.external;

    // A multi-line macro called inside a text body expands to lines with the macro's own indentation,
    // so shifting the body would change how its lines sit relative to the expansion.
    if (result.external || result.constructs.some((construct) => construct.kind === "pp-def")) {
      for (const info of result.lines.values()) {
        if (info.role !== "text") continue;
        info.role = "verbatim";
        info.group = -1;
      }
      result.groups.length = 0;
    }

    const constructOffset = doc.constructs.length;
    const groupOffset = doc.groups.length;
    for (const construct of result.constructs) {
      doc.constructs.push({ ...construct, parent: construct.parent < 0 ? -1 : construct.parent + constructOffset });
    }
    for (const group of result.groups) doc.groups.push(group);
    for (const issue of result.issues) {
      doc.issues.push({ ...issue, construct: issue.construct < 0 ? -1 : issue.construct + constructOffset });
    }
    for (const [line, info] of result.lines) {
      doc.lines[line] = { ...info, group: info.group < 0 ? -1 : info.group + groupOffset };
    }
  });
  return doc;
}
