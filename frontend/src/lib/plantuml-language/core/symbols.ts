import type { DiagramBlock, DiagramKind, Range } from "./types";
import type { LineInfo } from "./lines";
import { parseNameForm, parseRelation, readOperand, skipSpaces, type Delimiter, type Operand } from "./relations";

/** What a symbol is, at the granularity the editor features care about. */
export type SymbolCategory =
  /** Participants, actors, states, use cases, components, nodes, tasks, ... */
  | "element"
  /** Class-family types: class, abstract class, struct, entity, object, map, json. */
  | "class"
  /** Interface, enum, annotation, protocol. */
  | "type"
  /** Package, namespace, box, partition, swimlane, network. */
  | "container"
  | "member"
  | "enumMember"
  /** Preprocessor: `!$var`, `!procedure`/`!function`, `!define`, procedure parameters. */
  | "variable"
  | "function"
  | "macro"
  | "parameter"
  | "sprite"
  /** Outline-only nodes: alt/loop groups, dividers, if/while blocks, mindmap nodes. */
  | "structure";

export interface Occurrence {
  symbol: number;
  line: number;
  startColumn: number;
  endColumn: number;
  /** "label" is the display text of a symbol that also has an alias. */
  role: "declaration" | "reference" | "label";
  delimiter: Delimiter;
}

export interface Parameter {
  name: string;
  defaultValue?: string;
}

export interface PumlSymbol {
  id: number;
  /** The name other statements use (the alias when there is one). */
  name: string;
  /** Display text when the symbol has an alias. */
  label?: string;
  /** The declaring keyword: "participant", "abstract class", "state", "!procedure", ... */
  keyword: string;
  category: SymbolCategory;
  /** Owning block index, or -1 for document-wide preprocessor symbols. */
  block: number;
  parent?: number;
  children: number[];
  declaration: Occurrence;
  /** Declared by first use rather than by a declaring statement. */
  implicit: boolean;
  /** Every occurrence, including the declaration and the label. */
  occurrences: Occurrence[];
  /** Full extent, including a body, for the outline. */
  range: Range;
  parameters?: Parameter[];
  /** Line range in which a parameter is visible. */
  scope?: { startLine: number; endLine: number };
  detail?: string;
}

export interface SymbolIndex {
  symbols: PumlSymbol[];
  /** Occurrences per line, sorted by column. */
  occurrencesByLine: Map<number, Occurrence[]>;
  /** Stereotypes used anywhere in the document, without the `<<` `>>`. */
  stereotypes: string[];
  /** `title` of each block, if it has one. */
  blockTitles: (string | undefined)[];
  /** Targets of `!include` / `!includeurl` lines, as written. */
  includes: string[];
}

interface Span {
  start: number;
  end: number;
  delimiter: Delimiter;
}

interface DeclareSpec {
  block: number;
  name: string;
  keyword: string;
  category: SymbolCategory;
  line: number;
  span: Span;
  label?: Operand;
  parent?: number;
  /** False for symbols that nothing can refer to (members, outline nodes). */
  register?: boolean;
  detail?: string;
}

class SymbolBuilder {
  readonly symbols: PumlSymbol[] = [];
  private readonly tables = new Map<number, Map<string, number>>();

  private table(block: number): Map<string, number> {
    let table = this.tables.get(block);
    if (!table) {
      table = new Map();
      this.tables.set(block, table);
    }
    return table;
  }

  /**
   * Packages and namespaces live beside the elements, not among them: a
   * package "Repository" may contain an interface Repository.
   */
  private key(name: string, category: SymbolCategory): string {
    return category === "container" ? `\u0000${name}` : name;
  }

  lookup(block: number, name: string): PumlSymbol | undefined {
    const table = this.tables.get(block);
    const id = table?.get(name) ?? table?.get(this.key(name, "container"));
    return id === undefined ? undefined : this.symbols[id];
  }

  private lookupExact(block: number, name: string, category: SymbolCategory): PumlSymbol | undefined {
    const id = this.tables.get(block)?.get(this.key(name, category));
    return id === undefined ? undefined : this.symbols[id];
  }

  private occurrence(symbol: number, line: number, span: Span, role: Occurrence["role"]): Occurrence {
    return { symbol, line, startColumn: span.start, endColumn: span.end, role, delimiter: span.delimiter };
  }

  declare(spec: DeclareSpec): PumlSymbol {
    const register = spec.register !== false;
    const existing = register ? this.lookupExact(spec.block, spec.name, spec.category) : undefined;
    if (existing) {
      const occ = this.occurrence(existing.id, spec.line, spec.span, "reference");
      if (existing.implicit) {
        // A declaring statement after the first use takes over as the declaration.
        existing.declaration.role = "reference";
        occ.role = "declaration";
        existing.declaration = occ;
        existing.implicit = false;
        existing.keyword = spec.keyword;
        existing.category = spec.category;
        existing.detail = spec.detail;
        existing.range = lineRange(spec.line, spec.span.start, spec.span.end);
        if (spec.parent !== undefined && existing.parent === undefined) this.adopt(spec.parent, existing);
        if (spec.label) this.attachLabel(existing, spec.line, spec.label);
      }
      existing.occurrences.push(occ);
      return existing;
    }
    const id = this.symbols.length;
    const declaration = this.occurrence(id, spec.line, spec.span, "declaration");
    const symbol: PumlSymbol = {
      id,
      name: spec.name,
      keyword: spec.keyword,
      category: spec.category,
      block: spec.block,
      children: [],
      declaration,
      implicit: false,
      occurrences: [declaration],
      range: lineRange(spec.line, spec.span.start, spec.span.end),
      detail: spec.detail,
    };
    this.symbols.push(symbol);
    if (register) this.table(spec.block).set(this.key(spec.name, spec.category), id);
    if (spec.parent !== undefined) this.adopt(spec.parent, symbol);
    if (spec.label) this.attachLabel(symbol, spec.line, spec.label);
    return symbol;
  }

  private adopt(parent: number, child: PumlSymbol): void {
    child.parent = parent;
    this.symbols[parent].children.push(child.id);
  }

  private attachLabel(symbol: PumlSymbol, line: number, label: Operand): void {
    symbol.label = label.text;
    symbol.occurrences.push(this.occurrence(symbol.id, line, label, "label"));
  }

  /** Record a use of `name`; when unknown and `implicit` is given, the use declares it. */
  refer(
    block: number,
    name: string,
    line: number,
    span: Span,
    implicit?: { keyword: string; category: SymbolCategory; parent?: number },
  ): PumlSymbol | undefined {
    const existing = this.lookup(block, name);
    if (existing) {
      existing.occurrences.push(this.occurrence(existing.id, line, span, "reference"));
      return existing;
    }
    if (!implicit) return undefined;
    const symbol = this.declare({ block, name, line, span, ...implicit });
    symbol.implicit = true;
    return symbol;
  }
}

function lineRange(line: number, start: number, end: number): Range {
  return { startLine: line, startColumn: start, endLine: line, endColumn: end };
}

/* ------------------------------------------------------------------------ */
/* Preprocessor (document-wide)                                             */
/* ------------------------------------------------------------------------ */

const DOCUMENT = -1;
const VAR_ASSIGN = /^(\s*!(?:global\s+|local\s+)?)(\$[\w]+)\s*\??=/;
const CALLABLE =
  /^(\s*!(?:unquoted\s+|final\s+)*(procedure|function|definelong|define)\s+)(\$?[\w]+)(\(([^)]*)\))?/i;
const CALLABLE_END = /^\s*!(?:endprocedure|endfunction|enddefinelong|end\s+procedure|end\s+function)\b/i;
const FOREACH = /^(\s*!foreach\s+)(\$[\w]+)/i;
const SPRITE = /^(\s*sprite\s+)(\$?[\w]+)/i;
const INCLUDE = /^\s*!(?:include|includeurl|include_once|include_many|includesub|import)\s+(.+?)\s*$/i;
const DOLLAR_NAME = /\$[A-Za-z_][\w]*/g;

interface CallableScope {
  startLine: number;
  endLine: number;
  owner: PumlSymbol;
  /** Column on the start line where the body begins (after the parameter list). */
  bodyColumn: number;
  /** Parameter name -> symbol id. */
  params: Map<string, number>;
}

function parseParameters(source: string, offset: number): { name: string; start: number; end: number; defaultValue?: string }[] {
  const out: { name: string; start: number; end: number; defaultValue?: string }[] = [];
  let depth = 0;
  let quote = false;
  let partStart = 0;
  const push = (from: number, to: number) => {
    const part = source.slice(from, to);
    const m = /^\s*(\$?[\w]+)\s*(?:=\s*(.*?))?\s*$/.exec(part);
    if (!m) return;
    const lead = part.indexOf(m[1]);
    out.push({ name: m[1], start: offset + from + lead, end: offset + from + lead + m[1].length, defaultValue: m[2] });
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      push(partStart, i);
      partStart = i + 1;
    }
  }
  push(partStart, source.length);
  return out;
}

function indexPreprocessor(
  builder: SymbolBuilder,
  lines: string[],
  info: LineInfo[],
  includes: string[],
): CallableScope[] {
  const scopes: CallableScope[] = [];
  let open: CallableScope | undefined;
  const plainNames: string[] = [];
  /** Columns already recorded as declarations, so the reference scan skips them. */
  const declared = new Map<number, Set<number>>();
  const mark = (line: number, column: number) => {
    const set = declared.get(line);
    if (set) set.add(column);
    else declared.set(line, new Set([column]));
  };

  for (let i = 0; i < lines.length; i++) {
    const mode = info[i].mode;
    if (mode === "outside" || mode === "comment" || mode === "tag") continue;
    const text = lines[i];
    if (text.indexOf("!") < 0 && !/^\s*sprite\b/i.test(text)) continue;

    const callable = CALLABLE.exec(text);
    if (callable) {
      const word = callable[2].toLowerCase();
      const name = callable[3];
      const start = callable[1].length;
      const isMacro = word.startsWith("define");
      const params = callable[5] !== undefined ? parseParameters(callable[5], start + name.length + 1) : [];
      const symbol = builder.declare({
        block: DOCUMENT,
        name,
        keyword: `!${word}`,
        category: isMacro ? "macro" : "function",
        line: i,
        span: { start, end: start + name.length, delimiter: "" },
      });
      mark(i, start);
      if (symbol.declaration.line === i) {
        symbol.parameters = params.map((p) => ({ name: p.name, defaultValue: p.defaultValue }));
        symbol.detail = callable[4] !== undefined ? `${name}(${params.map((p) => p.name).join(", ")})` : name;
        if (!name.startsWith("$")) plainNames.push(name);
      }
      // `!define` and `!function $f($x) !return ...` are complete on their own line.
      const multiline = word !== "define" && !/\)\s*!return\b/i.test(text);
      if (open) {
        // A definition that was never closed ends where the next one starts.
        open.endLine = i - 1;
        open = undefined;
      }
      const scope: CallableScope = {
        startLine: i,
        endLine: multiline ? lines.length - 1 : i,
        owner: symbol,
        bodyColumn: callable[0].length,
        params: new Map(),
      };
      for (const p of params) {
        const param = builder.declare({
          block: DOCUMENT,
          name: p.name,
          keyword: "parameter",
          category: "parameter",
          line: i,
          span: { start: p.start, end: p.end, delimiter: "" },
          parent: symbol.id,
          register: false,
          detail: p.defaultValue !== undefined ? `= ${p.defaultValue}` : undefined,
        });
        param.scope = scope;
        scope.params.set(p.name, param.id);
        mark(i, p.start);
      }
      scopes.push(scope);
      if (multiline) open = scope;
      continue;
    }
    if (open && CALLABLE_END.test(text)) {
      open.endLine = i;
      open.owner.range = { ...open.owner.range, endLine: i, endColumn: text.length };
      open = undefined;
      continue;
    }
    const assign = VAR_ASSIGN.exec(text);
    if (assign) {
      const start = assign[1].length;
      mark(i, start);
      // A `!local` inside a procedure shadows nothing we track; treat it like any variable.
      builder.declare({
        block: DOCUMENT,
        name: assign[2],
        keyword: "variable",
        category: "variable",
        line: i,
        span: { start, end: start + assign[2].length, delimiter: "" },
        detail: text.slice(text.indexOf("=", start) + 1).trim() || undefined,
      });
      continue;
    }
    const each = FOREACH.exec(text);
    if (each) {
      const start = each[1].length;
      mark(i, start);
      builder.declare({
        block: DOCUMENT,
        name: each[2],
        keyword: "variable",
        category: "variable",
        line: i,
        span: { start, end: start + each[2].length, delimiter: "" },
        detail: "loop variable",
      });
      continue;
    }
    const sprite = SPRITE.exec(text);
    if (sprite) {
      const start = sprite[1].length;
      const name = sprite[2].startsWith("$") ? sprite[2] : `$${sprite[2]}`;
      mark(i, start);
      builder.declare({
        block: DOCUMENT,
        name,
        keyword: "sprite",
        category: "sprite",
        line: i,
        span: { start, end: start + sprite[2].length, delimiter: "" },
      });
      continue;
    }
    const include = INCLUDE.exec(text);
    if (include) includes.push(include[1]);
  }

  // References: `$name` anywhere the preprocessor substitutes (statements and free text alike).
  const plain = plainNames.length
    ? new RegExp(`(?<![\\w$])(?:${plainNames.map(escapeRegExp).join("|")})(?![\\w])`, "g")
    : undefined;
  let scopeIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const mode = info[i].mode;
    if (mode === "outside" || mode === "comment" || mode === "tag") continue;
    const text = lines[i];
    while (scopeIndex < scopes.length && scopes[scopeIndex].endLine < i) scopeIndex++;
    const scope = scopes[scopeIndex] && scopes[scopeIndex].startLine <= i ? scopes[scopeIndex] : undefined;
    const marks = declared.get(i);
    const taken = (start: number) => marks !== undefined && marks.has(start);

    if (text.indexOf("$") >= 0) {
      DOLLAR_NAME.lastIndex = 0;
      for (let m = DOLLAR_NAME.exec(text); m; m = DOLLAR_NAME.exec(text)) {
        if (taken(m.index)) continue;
        const span = { start: m.index, end: m.index + m[0].length, delimiter: "" as const };
        const paramId = scope?.params.get(m[0]);
        if (paramId !== undefined) {
          const param = builder.symbols[paramId];
          param.occurrences.push({ symbol: paramId, line: i, startColumn: span.start, endColumn: span.end, role: "reference", delimiter: "" });
        } else builder.refer(DOCUMENT, m[0], i, span);
      }
    }
    if (scope) {
      // Unquoted parameters (no `$`) are substituted as whole words inside the body.
      for (const [name, id] of scope.params) {
        if (name.startsWith("$")) continue;
        const re = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w])`, "g");
        if (i === scope.startLine) re.lastIndex = scope.bodyColumn;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          if (taken(m.index)) continue;
          builder.symbols[id].occurrences.push({ symbol: id, line: i, startColumn: m.index, endColumn: m.index + name.length, role: "reference", delimiter: "" });
        }
      }
    }
    if (plain) {
      plain.lastIndex = 0;
      for (let m = plain.exec(text); m; m = plain.exec(text)) {
        if (taken(m.index)) continue;
        builder.refer(DOCUMENT, m[0], i, { start: m.index, end: m.index + m[0].length, delimiter: "" });
      }
    }
  }
  return scopes;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------------ */
/* Per-block extraction                                                     */
/* ------------------------------------------------------------------------ */

interface Frame {
  /** Symbol that owns the frame, if any. */
  symbol?: PumlSymbol;
  /** What closes it: a `}` line, or a keyword such as `end`. */
  closer: "brace" | "end" | "endbox";
  tag?: string;
}

interface BlockContext {
  builder: SymbolBuilder;
  block: DiagramBlock;
  index: number;
  lines: string[];
  info: LineInfo[];
  stack: Frame[];
  memberOwner?: PumlSymbol;
  /** Names that are parameters of the enclosing procedure on the current line. */
  params?: Map<string, number>;
  stereotypes: Set<string>;
  title?: string;
}

function parentOf(ctx: BlockContext): number | undefined {
  for (let i = ctx.stack.length - 1; i >= 0; i--) {
    const symbol = ctx.stack[i].symbol;
    if (symbol) return symbol.id;
  }
  return undefined;
}

/** The container an element belongs to: control-flow groups (alt, loop, ...) do not own participants. */
function elementParent(ctx: BlockContext): number | undefined {
  for (let i = ctx.stack.length - 1; i >= 0; i--) {
    const symbol = ctx.stack[i].symbol;
    if (symbol && (symbol.category !== "structure" || symbol.keyword === "box")) return symbol.id;
  }
  return undefined;
}

function closeFrame(ctx: BlockContext, line: number, closer: Frame["closer"], tag?: string): void {
  for (let i = ctx.stack.length - 1; i >= 0; i--) {
    const frame = ctx.stack[i];
    if (frame.closer !== closer || (tag !== undefined && frame.tag !== tag)) continue;
    for (const popped of ctx.stack.splice(i)) {
      if (popped.symbol) popped.symbol.range = { ...popped.symbol.range, endLine: line, endColumn: ctx.lines[line].length };
    }
    return;
  }
}

function structure(ctx: BlockContext, line: number, name: string, keyword: string, start: number, end: number): PumlSymbol {
  return ctx.builder.declare({
    block: ctx.index,
    name,
    keyword,
    category: "structure",
    line,
    span: { start, end, delimiter: "" },
    parent: parentOf(ctx),
    register: false,
  });
}

function isPreprocessorName(text: string): boolean {
  return text.startsWith("$") || text.startsWith("%");
}

/** False for names that are preprocessor placeholders rather than diagram elements. */
function declarable(ctx: BlockContext, name: string): boolean {
  return name !== "" && !isPreprocessorName(name) && !ctx.params?.has(name);
}

/** Record a use of an operand, resolving `ns.Name` to `Name` when only that is declared. */
function referOperand(
  ctx: BlockContext,
  line: number,
  op: Operand,
  implicit?: { keyword: string; category: SymbolCategory },
): PumlSymbol | undefined {
  if (op.pseudo || !op.text || isPreprocessorName(op.text) || ctx.params?.has(op.text)) return undefined;
  const { builder, index } = ctx;
  if (builder.lookup(index, op.text)) return builder.refer(index, op.text, line, op);
  if (op.delimiter === "" && op.text.includes(".")) {
    const lastDot = op.text.lastIndexOf(".");
    const tail = op.text.slice(lastDot + 1);
    const qualifier = op.text.slice(0, lastDot);
    if (builder.lookup(index, tail)) {
      if (builder.lookup(index, qualifier)) {
        builder.refer(index, qualifier, line, { start: op.start, end: op.start + lastDot, delimiter: "" });
      }
      return builder.refer(index, tail, line, { start: op.start + lastDot + 1, end: op.end, delimiter: "" });
    }
  }
  return builder.refer(index, op.text, line, op, implicit ? { ...implicit, parent: elementParent(ctx) } : undefined);
}

const NOTE = /^(\s*(?:floating\s+)?[hr]?note\s+)(.*)$/i;

/** `note left of X`, `note over A, B`, `note "text" as N`: common to most dialects. */
function noteLine(ctx: BlockContext, line: number, text: string): boolean {
  const m = NOTE.exec(text);
  if (!m) return false;
  let i = m[1].length;
  const rest = m[2];
  const inlineAs = /^"[^"]*"\s+as\s+/.exec(rest) ?? /^as\s+/i.exec(rest);
  if (inlineAs) {
    const op = readOperand(text, i + inlineAs[0].length);
    if (op) {
      ctx.builder.declare({ block: ctx.index, name: op.text, keyword: "note", category: "element", line, span: op });
    }
    return true;
  }
  const target = /^(?:(?:left|right|top|bottom)\s+of|over|on\s+link|across|left|right|top|bottom)\b\s*/i.exec(rest);
  if (!target) return true;
  if (!/of|over/i.test(target[0])) return true;
  i += target[0].length;
  for (;;) {
    i = skipSpaces(text, i);
    const op = readOperand(text, i);
    if (!op) break;
    referOperand(ctx, line, op);
    i = skipSpaces(text, op.outerEnd);
    if (text[i] !== ",") break;
    i++;
  }
  return true;
}

function collectStereotypes(ctx: BlockContext, text: string): void {
  if (text.indexOf("<<") < 0) return;
  const re = /<<\s*(?:\([^)]*\)\s*)?([^<>]+?)\s*>>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) ctx.stereotypes.add(m[1]);
}

/* ---- Sequence ---------------------------------------------------------- */

const SEQ_DECL = /^(\s*)(participant|actor|boundary|control|entity|database|collections|queue)\s+/i;
const SEQ_CREATE = /^(\s*create\s+)(?:(participant|actor|boundary|control|entity|database|collections|queue)\s+)?/i;
const SEQ_LIFE = /^(\s*(?:activate|deactivate|destroy)\s+)/i;
const SEQ_GROUP = /^(\s*)(alt|opt|loop|par|par2|break|critical|group|partition)\b\s*(.*)$/i;
const SEQ_ELSE = /^(\s*)(else|also)\b\s*(.*)$/i;
const SEQ_DIVIDER = /^(\s*==+\s*)(.*?)\s*==+\s*$/;
const SEQ_BOX = /^(\s*box\b\s*)(.*)$/i;
const SEQ_REF = /^(\s*ref\s+over\s+)/i;
const PARTICIPANT = { keyword: "participant", category: "element" as const };

function sequenceLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  const decl = SEQ_DECL.exec(text);
  if (decl && !parseRelation(text)?.right.length) {
    const form = parseNameForm(text, decl[0].length);
    if (form && declarable(ctx, form.code.text)) {
      builder.declare({
        block: index,
        name: form.code.text,
        keyword: decl[2].toLowerCase(),
        category: "element",
        line,
        span: form.code,
        label: form.label,
        parent: elementParent(ctx),
      });
    }
    return;
  }
  const create = SEQ_CREATE.exec(text);
  if (create) {
    const form = parseNameForm(text, create[0].length);
    if (form) {
      const keyword = create[2]?.toLowerCase();
      if (keyword && declarable(ctx, form.code.text)) {
        builder.declare({ block: index, name: form.code.text, keyword, category: "element", line, span: form.code, label: form.label });
      } else referOperand(ctx, line, form.code, PARTICIPANT);
    }
    return;
  }
  const life = SEQ_LIFE.exec(text);
  if (life) {
    const op = readOperand(text, life[0].length);
    if (op) referOperand(ctx, line, op, PARTICIPANT);
    return;
  }
  // Delays (`... 5 minutes later ...`) and spacing (`|||`, `||45||`) carry text, not names.
  if (/^\s*(?:\.\.\.|\|\|)/.test(text)) return;
  if (/^\s*end\s*box\b/i.test(text)) return closeFrame(ctx, line, "endbox");
  if (/^\s*end\s*$/i.test(text)) return closeFrame(ctx, line, "end");
  const box = SEQ_BOX.exec(text);
  if (box) {
    const title = /^"([^"]*)"/.exec(box[2]);
    const inner = title ? title[1] : box[2].replace(/\s*#\S+\s*$/, "").trim();
    const start = box[1].length + (title ? 1 : 0);
    const symbol = builder.declare({
      block: index,
      name: inner || "box",
      keyword: "box",
      category: "structure",
      line,
      span: { start, end: start + inner.length, delimiter: title ? '"' : "" },
      register: false,
    });
    ctx.stack.push({ symbol, closer: "endbox" });
    return;
  }
  const group = SEQ_GROUP.exec(text);
  if (group) {
    const start = group[1].length;
    const symbol = structure(ctx, line, `${group[2].toLowerCase()} ${group[3]}`.trim(), group[2].toLowerCase(), start, text.trimEnd().length);
    ctx.stack.push({ symbol, closer: "end" });
    return;
  }
  const otherwise = SEQ_ELSE.exec(text);
  if (otherwise) {
    structure(ctx, line, `${otherwise[2].toLowerCase()} ${otherwise[3]}`.trim(), "else", otherwise[1].length, text.trimEnd().length);
    return;
  }
  const divider = SEQ_DIVIDER.exec(text);
  if (divider) {
    structure(ctx, line, divider[2] || "divider", "divider", divider[1].length, divider[1].length + divider[2].length);
    return;
  }
  const ref = SEQ_REF.exec(text);
  if (ref) {
    let i = ref[0].length;
    for (;;) {
      const op = readOperand(text, skipSpaces(text, i));
      if (!op) break;
      referOperand(ctx, line, op, PARTICIPANT);
      i = skipSpaces(text, op.outerEnd);
      if (text[i] !== ",") break;
      i++;
    }
    return;
  }
  if (noteLine(ctx, line, text)) return;
  const rel = parseRelation(text);
  if (!rel) return;
  for (const op of [...rel.left, ...rel.right]) {
    if (op.delimiter === "" || op.delimiter === '"') referOperand(ctx, line, op, PARTICIPANT);
  }
}

/* ---- Class / state / description (element diagrams) ------------------- */

interface ElementDialect {
  /** Declaring keywords, longest first where one prefixes another. */
  declaration: RegExp;
  category(keyword: string): SymbolCategory;
  /** Keyword and category for a name first seen in a relation. */
  implicit(op: Operand): { keyword: string; category: SymbolCategory };
  /** `(Use case)`, `[Component]`, `:Actor:` shorthand declarations. */
  shorthand: boolean;
  /** `Name : text` adds a member (class) or description (state). */
  colonMembers: "member" | "description" | "none";
}

const CLASS_TYPES = new Set(["interface", "enum", "annotation", "protocol", "metaclass", "stereotype"]);
const CONTAINERS = new Set(["package", "namespace", "together", "box", "partition"]);

const CLASS_DIALECT: ElementDialect = {
  declaration:
    /^(\s*)(?:[-+#~]\s*)?(abstract\s+class|static\s+class|abstract|class|interface|enum|annotation|struct|entity|exception|metaclass|protocol|object|map|json|dataclass|record|circle|diamond|package|namespace|together|\(\))(?=[\s{]|$)\s*/i,
  category: (keyword) =>
    CONTAINERS.has(keyword) ? "container" : CLASS_TYPES.has(keyword) ? "type" : keyword === "circle" || keyword === "diamond" ? "element" : "class",
  implicit: () => ({ keyword: "class", category: "class" }),
  shorthand: false,
  colonMembers: "member",
};

const STATE_DIALECT: ElementDialect = {
  declaration: /^(\s*)(state|package|frame)(?=[\s{]|$)\s*/i,
  category: (keyword) => (keyword === "package" || keyword === "frame" ? "container" : "element"),
  implicit: () => ({ keyword: "state", category: "element" }),
  shorthand: false,
  colonMembers: "description",
};

const DESCRIPTION_KEYWORDS =
  "actor|usecase|component|interface|node|database|cloud|artifact|folder|frame|storage|agent|card|file|hexagon|label|stack|person|process|action|queue|rectangle|boundary|control|entity|collections|circle|port|portin|portout|package|together|archimate|\\(\\)";

const DESCRIPTION_DIALECT: ElementDialect = {
  declaration: new RegExp(`^(\\s*)(${DESCRIPTION_KEYWORDS})(?:/)?(?=[\\s{]|$)\\s*(?:#\\S+\\s+)?`, "i"),
  category: (keyword) => (keyword === "package" || keyword === "together" ? "container" : keyword === "interface" ? "type" : "element"),
  implicit: (op) => {
    if (op.delimiter === "(") return { keyword: "usecase", category: "element" };
    if (op.delimiter === ":") return { keyword: "actor", category: "element" };
    if (op.delimiter === "[") return { keyword: "component", category: "element" };
    return { keyword: "element", category: "element" };
  },
  shorthand: true,
  colonMembers: "none",
};

/** Any `@startuml` body we could not classify: index what a class or description diagram would. */
const GENERIC_DIALECT: ElementDialect = {
  declaration: new RegExp(
    `^(\\s*)(abstract\\s+class|abstract|class|enum|annotation|struct|object|map|json|namespace|state|participant|${DESCRIPTION_KEYWORDS})(?:/)?(?=[\\s{]|$)\\s*(?:#\\S+\\s+)?`,
    "i",
  ),
  category: (keyword) => (CLASS_DIALECT.declaration.test(`${keyword} x`) ? CLASS_DIALECT.category(keyword) : DESCRIPTION_DIALECT.category(keyword)),
  implicit: DESCRIPTION_DIALECT.implicit,
  shorthand: true,
  colonMembers: "none",
};

const MEMBER_BODY = /^(?:abstract\s+class|static\s+class|abstract|class|interface|enum|annotation|struct|entity|exception|metaclass|protocol|object|map|dataclass|record|relationship)$/;

function elementLine(ctx: BlockContext, line: number, text: string, dialect: ElementDialect): void {
  const { builder, index } = ctx;
  const trimmed = text.trim();
  if (trimmed.startsWith("}")) {
    if (ctx.memberOwner) {
      ctx.memberOwner.range = { ...ctx.memberOwner.range, endLine: line, endColumn: text.length };
      ctx.memberOwner = undefined;
    } else closeFrame(ctx, line, "brace");
    return;
  }
  if (noteLine(ctx, line, text)) return;

  const relation = parseRelation(text);
  const isRelation = relation !== undefined && relation.left.length > 0 && !relation.openLeft;
  const declMatch = isRelation ? null : dialect.declaration.exec(text);
  // `Circle : +area()` adds a member to a class that merely spells a keyword.
  const decl = declMatch && text[declMatch[0].length] !== ":" ? declMatch : null;
  if (decl) {
    const written = decl[2].toLowerCase().replace(/\s+/g, " ");
    const keyword = written === "()" ? "interface" : written;
    const opensBody = /\{\s*$/.test(trimmed) && !/\{\s*\}\s*$/.test(trimmed);
    const form = parseNameForm(text, decl[0].length);
    const category = dialect.category(keyword);
    if (!form || !declarable(ctx, form.code.text) || /^[{<#]/.test(text.slice(decl[0].length).trimStart())) {
      // `together {`, `package {`: an anonymous group.
      if (opensBody) ctx.stack.push({ closer: "brace" });
      return;
    }
    const symbol = builder.declare({
      block: index,
      name: form.code.text,
      keyword,
      category,
      line,
      span: form.code,
      label: form.label,
      parent: parentOf(ctx),
    });
    referInheritance(ctx, line, text, form.end, dialect);
    if (opensBody) {
      if (MEMBER_BODY.test(keyword) && ctx.info[line + 1]?.mode !== "code") ctx.memberOwner = symbol;
      else if (keyword !== "json") ctx.stack.push({ symbol, closer: "brace" });
    }
    return;
  }

  if (isRelation && relation) {
    for (const op of [...relation.left, ...relation.right]) referOperand(ctx, line, op, dialect.implicit(op));
    return;
  }

  if (dialect.shorthand && /^\s*(?:\(|\[|:)/.test(text)) {
    const form = parseNameForm(text, 0);
    if (form && !form.code.pseudo && declarable(ctx, form.code.text)) {
      const shape = form.label ?? form.code;
      const implicit = dialect.implicit(shape.delimiter === "" ? form.code : shape);
      const symbol = builder.declare({
        block: index,
        name: form.code.text,
        keyword: implicit.keyword,
        category: implicit.category,
        line,
        span: form.code,
        label: form.label,
        parent: parentOf(ctx),
      });
      if (/\{\s*$/.test(trimmed)) ctx.stack.push({ symbol, closer: "brace" });
    }
    return;
  }

  if (dialect.colonMembers !== "none") {
    const colon = /^(\s*)([\p{L}\p{N}_.]+|"[^"]+")\s*:\s*(.*)$/u.exec(text);
    if (colon) {
      const op = readOperand(text, colon[1].length);
      if (!op) return;
      const owner = referOperand(ctx, line, op, dialect.implicit(op));
      if (owner && dialect.colonMembers === "member") {
        const offset = text.length - colon[3].length;
        addMember(ctx, owner, line, text, offset);
      }
      return;
    }
  }

  const visibility = /^(\s*(?:hide|show|remove|restore)\s+)([\p{L}\p{N}_.]+)/iu.exec(text);
  if (visibility && builder.lookup(index, visibility[2])) {
    const start = visibility[1].length;
    builder.refer(index, visibility[2], line, { start, end: start + visibility[2].length, delimiter: "" });
  }
}

/** `extends A, B implements C` after a class name (generic parameters are not names). */
function referInheritance(ctx: BlockContext, line: number, text: string, from: number, dialect: ElementDialect): void {
  let i = skipSpaces(text, from);
  if (text[i] === "<" && text[i + 1] !== "<") {
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === "<") depth++;
      else if (text[i] === ">" && --depth === 0) break;
    }
    i++;
  }
  const keyword = /\b(?:extends|implements)\b/gi;
  keyword.lastIndex = i;
  for (let m = keyword.exec(text); m; m = keyword.exec(text)) {
    let at = m.index + m[0].length;
    for (;;) {
      at = skipSpaces(text, at);
      const op = readOperand(text, at);
      if (!op || /^(?:extends|implements)$/i.test(op.text)) break;
      referOperand(ctx, line, op, dialect.implicit(op));
      at = skipSpaces(text, op.outerEnd);
      if (text[at] !== ",") break;
      at++;
    }
  }
}

const MEMBER_MODIFIER = /^(?:\{(?:static|abstract|classifier|field|method)\}\s*|[-+#~*]\s*)+/i;

interface MemberName {
  name: string;
  start: number;
  kind: "field" | "method" | "enumMember";
}

function parseMember(body: string, offset: number, ownerKeyword: string): MemberName | undefined {
  const lead = body.length - body.trimStart().length;
  let rest = body.trim();
  if (!rest || /^(?:--|==|\.\.|__|'|\}|\{$)/.test(rest)) return undefined;
  let start = offset + lead;
  const modifier = MEMBER_MODIFIER.exec(rest);
  if (modifier) {
    start += modifier[0].length;
    rest = rest.slice(modifier[0].length);
  }
  const word = /[\p{L}\p{N}_$]+/u;
  if (ownerKeyword === "enum") {
    const m = word.exec(rest);
    return m && m.index === 0 ? { name: m[0], start, kind: "enumMember" } : undefined;
  }
  if (rest.startsWith('"')) {
    const close = rest.indexOf('"', 1);
    return close > 1 ? { name: rest.slice(1, close), start: start + 1, kind: "field" } : undefined;
  }
  const paren = rest.indexOf("(");
  const colon = rest.indexOf(":");
  if (paren > 0 && (colon < 0 || paren < colon)) {
    const m = /([\p{L}\p{N}_$]+)\s*$/u.exec(rest.slice(0, paren));
    return m ? { name: m[1], start: start + m.index, kind: "method" } : undefined;
  }
  const arrow = /\s*(?:=>|\*-+>|=)/.exec(rest);
  const head = colon > 0 ? rest.slice(0, colon) : arrow ? rest.slice(0, arrow.index) : rest.replace(/\s*<<.*$/, "").replace(/\s*\{.*$/, "");
  const names = [...head.matchAll(/[\p{L}\p{N}_$]+/gu)];
  const pick = colon > 0 || arrow ? names[names.length - 1] : names[names.length - 1];
  if (!pick || pick.index === undefined) return undefined;
  return { name: pick[0], start: start + pick.index, kind: "field" };
}

function addMember(ctx: BlockContext, owner: PumlSymbol, line: number, text: string, offset: number): void {
  const member = parseMember(text.slice(offset), offset, owner.keyword);
  if (!member) return;
  ctx.builder.declare({
    block: ctx.index,
    name: member.name,
    keyword: member.kind === "enumMember" ? "enum constant" : member.kind,
    category: member.kind === "enumMember" ? "enumMember" : "member",
    line,
    span: { start: member.start, end: member.start + member.name.length, delimiter: "" },
    parent: owner.id,
    register: false,
    detail: text.trim(),
  });
  if (owner.keyword === "map") {
    const link = /\*-+>\s*/.exec(text.slice(offset));
    if (link) {
      const op = readOperand(text, offset + link.index + link[0].length);
      if (op) referOperand(ctx, line, op);
    }
  }
}

/* ---- Activity ---------------------------------------------------------- */

const SWIMLANE = /^(\s*\|(?:#[^|]+\|)?)([^|]+)\|/;
const ACT_PARTITION = /^(\s*(partition|package|rectangle|card|group)\s+)(?:#\S+\s+)?("[^"]*"|[^{#]*?)\s*(?:#\S+\s*)?(\{)?\s*$/i;
const ACT_OPEN = /^(\s*)(if|while|repeat|switch|fork|split)\b(?!\s+again)\s*(?:\((.*?)\))?/i;
const ACT_CLOSE: Record<string, RegExp> = {
  if: /^\s*end\s*if\b/i,
  while: /^\s*end\s*while\b/i,
  repeat: /^\s*repeat\s*while\b/i,
  switch: /^\s*end\s*switch\b/i,
  fork: /^\s*(?:end\s*fork|end\s*merge)\b/i,
  split: /^\s*end\s*split\b/i,
};

function activityLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  const trimmed = text.trim();
  const lane = SWIMLANE.exec(text);
  if (lane) {
    const name = lane[2].trim();
    const start = lane[1].length + (lane[2].length - lane[2].trimStart().length);
    builder.refer(index, name, line, { start, end: start + name.length, delimiter: "" }, { keyword: "swimlane", category: "container" });
    return;
  }
  if (trimmed.startsWith("}")) return closeFrame(ctx, line, "brace");
  if (/^\s*end\s*group\b/i.test(text)) return closeFrame(ctx, line, "end", "group");
  for (const [tag, re] of Object.entries(ACT_CLOSE)) {
    if (re.test(text)) return closeFrame(ctx, line, "end", tag);
  }
  const partition = ACT_PARTITION.exec(text);
  if (partition && (partition[4] || partition[2].toLowerCase() === "group")) {
    const raw = partition[3];
    const quoted = raw.startsWith('"');
    const name = quoted ? raw.slice(1, -1) : raw.trim();
    const start = text.indexOf(raw, partition[1].length) + (quoted ? 1 : 0);
    const symbol = structure(ctx, line, name || partition[2], partition[2].toLowerCase(), start, start + name.length);
    ctx.stack.push(partition[4] ? { symbol, closer: "brace" } : { symbol, closer: "end", tag: "group" });
    return;
  }
  const open = ACT_OPEN.exec(text);
  if (open && !/^\s*repeat\s*while\b/i.test(text)) {
    const tag = open[2].toLowerCase();
    const start = open[1].length;
    const symbol = structure(ctx, line, open[3] ? `${tag} ${open[3]}` : tag, tag, start, start + open[2].length);
    ctx.stack.push({ symbol, closer: "end", tag });
    return;
  }
  const jump = /^(\s*(label|goto)\s+)([\p{L}\p{N}_]+)/iu.exec(text);
  if (jump) {
    const span = { start: jump[1].length, end: jump[1].length + jump[3].length, delimiter: "" as const };
    if (jump[2].toLowerCase() === "label") builder.declare({ block: index, name: jump[3], keyword: "label", category: "element", line, span });
    else builder.refer(index, jump[3], line, span, { keyword: "label", category: "element" });
  }
}

/* ---- Legacy activity --------------------------------------------------- */

const LEGACY_ARROW = /\s*[-.=]+(?:\[[^\]]*\])?(?:(?:left|right|up|down|l|r|u|d)[-.=]+)?[-.=]*>\s*(?:\[[^\]]*\]\s*)?/y;
const LEGACY_ACTIVITY = { keyword: "activity", category: "element" as const };

/** Read one end of a legacy flow at `at`; `commit` records it. Returns the column after it, or -1. */
function legacyOperand(ctx: BlockContext, line: number, text: string, at: number, commit: boolean): number {
  const i = skipSpaces(text, at);
  const bar = /={3,}\s*([\p{L}\p{N}_.]+)\s*={3,}/uy;
  bar.lastIndex = i;
  const barMatch = bar.exec(text);
  if (barMatch) {
    const start = i + barMatch[0].indexOf(barMatch[1]);
    if (commit) {
      ctx.builder.refer(ctx.index, barMatch[1], line, { start, end: start + barMatch[1].length, delimiter: "" }, { keyword: "bar", category: "element" });
    }
    return i + barMatch[0].length;
  }
  const form = parseNameForm(text, i);
  if (!form) return -1;
  if (form.code.pseudo || !commit) return form.end;
  if (form.label) {
    ctx.builder.declare({ block: ctx.index, name: form.code.text, line, span: form.code, label: form.label, ...LEGACY_ACTIVITY });
  } else referOperand(ctx, line, form.code, LEGACY_ACTIVITY);
  return form.end;
}

function legacyLine(ctx: BlockContext, line: number, text: string): void {
  const trimmed = text.trim();
  if (trimmed.startsWith("}")) return closeFrame(ctx, line, "brace");
  if (noteLine(ctx, line, text)) return;
  const partition = /^(\s*partition\s+)("[^"]*"|[\p{L}\p{N}_]+)/iu.exec(text);
  if (partition) {
    const quoted = partition[2].startsWith('"');
    const name = quoted ? partition[2].slice(1, -1) : partition[2];
    const start = partition[1].length + (quoted ? 1 : 0);
    const symbol = structure(ctx, line, name, "partition", start, start + name.length);
    if (/\{\s*$/.test(trimmed)) ctx.stack.push({ symbol, closer: "brace" });
    return;
  }
  if (/^\s*(?:if|else|endif|end)\b/i.test(text)) return;
  const start = skipSpaces(text, 0);
  LEGACY_ARROW.lastIndex = start;
  // A flow either continues from the previous activity (`--> "Next"`) or names its source first.
  const leftEnd = LEGACY_ARROW.exec(text) ? start : legacyOperand(ctx, line, text, start, false);
  if (leftEnd < 0) return;
  LEGACY_ARROW.lastIndex = leftEnd;
  const arrow = LEGACY_ARROW.exec(text);
  if (!arrow) return;
  if (leftEnd > start) legacyOperand(ctx, line, text, start, true);
  legacyOperand(ctx, line, text, leftEnd + arrow[0].length, true);
}

/* ---- Timing ------------------------------------------------------------ */

const TIMING_DECL = /^(\s*(?:compact\s+)?)(robust|concise|clock|binary|analog|rectangle)\s+/i;

function timingLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  const decl = TIMING_DECL.exec(text);
  if (decl) {
    const form = parseNameForm(text, decl[0].length);
    if (form) {
      builder.declare({ block: index, name: form.code.text, keyword: decl[2].toLowerCase(), category: "element", line, span: form.code, label: form.label });
    }
    return;
  }
  if (noteLine(ctx, line, text)) return;
  const at = /^(\s*@)([\p{L}_][\p{L}\p{N}_.]*)\s*$/u.exec(text);
  if (at) {
    builder.refer(index, at[2], line, { start: at[1].length, end: at[1].length + at[2].length, delimiter: "" });
    return;
  }
  const is = /^(\s*)([\p{L}_][\p{L}\p{N}_.]*)\s+(?:is|has)\b/u.exec(text);
  if (is) {
    builder.refer(index, is[2], line, { start: is[1].length, end: is[1].length + is[2].length, delimiter: "" });
    return;
  }
  const message = /^(\s*)([\p{L}_][\p{L}\p{N}_.]*)(@\S+)?\s*(<?-+>?)\s*([\p{L}_][\p{L}\p{N}_.]*)/u.exec(text);
  if (message) {
    const leftStart = message[1].length;
    builder.refer(index, message[2], line, { start: leftStart, end: leftStart + message[2].length, delimiter: "" });
    const rightStart = message[0].length - message[5].length;
    builder.refer(index, message[5], line, { start: rightStart, end: rightStart + message[5].length, delimiter: "" });
  }
}

/* ---- Gantt ------------------------------------------------------------- */

const GANTT_TASK = /(?<!\[)\[([^[\]]+)\](?!\])/g;
const GANTT_RESOURCE = /\{([^{}:]+)(?::[^{}]*)?\}/g;

function ganttLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  if (noteLine(ctx, line, text)) return;
  const separator = /^(\s*--+\s*)(.*?)\s*--+\s*$/.exec(text);
  if (separator) {
    structure(ctx, line, separator[2] || "separator", "separator", separator[1].length, separator[1].length + separator[2].length);
    return;
  }
  const alias = /^(\s*(?:then\s+)?)\[([^[\]]+)\]\s+as\s+\[([^[\]]+)\]/i.exec(text);
  const milestone = /\bhappens\b/i.test(text);
  let skipUntil = 0;
  if (alias) {
    const labelStart = alias[1].length + 1;
    const codeStart = alias[0].length - alias[3].length - 1;
    builder.declare({
      block: index,
      name: alias[3],
      keyword: milestone ? "milestone" : "task",
      category: "element",
      line,
      span: { start: codeStart, end: codeStart + alias[3].length, delimiter: "[" },
      label: { text: alias[2], start: labelStart, end: labelStart + alias[2].length, delimiter: "[", outerEnd: labelStart + alias[2].length + 1 },
    });
    skipUntil = alias[0].length;
  }
  GANTT_TASK.lastIndex = skipUntil;
  for (let m = GANTT_TASK.exec(text); m; m = GANTT_TASK.exec(text)) {
    const span = { start: m.index + 1, end: m.index + 1 + m[1].length, delimiter: "[" as const };
    const symbol = builder.refer(index, m[1], line, span, { keyword: "task", category: "element" });
    if (symbol && milestone && symbol.declaration.line === line && symbol.implicit) symbol.keyword = "milestone";
  }
  GANTT_RESOURCE.lastIndex = 0;
  for (let m = GANTT_RESOURCE.exec(text); m; m = GANTT_RESOURCE.exec(text)) {
    const name = m[1].trim();
    const start = m.index + 1 + (m[1].length - m[1].trimStart().length);
    const resource = builder.refer(index, `{${name}}`, line, { start, end: start + name.length, delimiter: "{" }, { keyword: "resource", category: "element" });
    // Keyed with braces so a resource never collides with a task of the same name.
    if (resource) resource.name = name;
  }
}

/* ---- Mindmap / WBS ----------------------------------------------------- */

const TREE_NODE = /^(\s*)([*+-]+|#+)(\[#[^\]]*\])?([_<>])?(:)?\s*(.*)$/;

function treeBlock(ctx: BlockContext): void {
  const { lines, info, block } = ctx;
  const open: { depth: number; symbol: PumlSymbol }[] = [];
  const last = block.closed ? block.endLine - 1 : block.endLine;
  for (let line = block.startLine + 1; line <= last; line++) {
    if (info[line].mode !== "code") continue;
    const text = lines[line];
    const m = TREE_NODE.exec(text);
    if (!m) continue;
    if (/^title\b/i.test(text.trim())) continue;
    // Indentation counts as depth for the single-marker (Markdown-like) notation.
    const depth = m[2].length + (m[2].length === 1 ? Math.floor(m[1].length / 2) : 0);
    const label = m[6].replace(/;\s*$/, "");
    const start = text.length - m[6].length;
    while (open.length && open[open.length - 1].depth >= depth) {
      const closed = open.pop();
      if (closed) closed.symbol.range = { ...closed.symbol.range, endLine: line - 1, endColumn: lines[line - 1].length };
    }
    const symbol = ctx.builder.declare({
      block: ctx.index,
      name: label || m[2],
      keyword: "node",
      category: "structure",
      line,
      span: { start, end: start + label.length, delimiter: "" },
      parent: open[open.length - 1]?.symbol.id,
      register: false,
    });
    open.push({ depth, symbol });
  }
  for (const node of open) node.symbol.range = { ...node.symbol.range, endLine: last, endColumn: lines[last]?.length ?? 0 };
}

/* ---- nwdiag ------------------------------------------------------------ */

function nwdiagLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  const trimmed = text.trim();
  if (trimmed.startsWith("}")) return closeFrame(ctx, line, "brace");
  if (/^nwdiag\s*\{/i.test(trimmed)) {
    ctx.stack.push({ closer: "brace" });
    return;
  }
  const network = /^(\s*network\s+)([\p{L}\p{N}_-]+)\s*\{/iu.exec(text);
  if (network) {
    const start = network[1].length;
    const symbol = builder.declare({
      block: index,
      name: network[2],
      keyword: "network",
      category: "container",
      line,
      span: { start, end: start + network[2].length, delimiter: "" },
    });
    ctx.stack.push({ symbol, closer: "brace" });
    return;
  }
  const group = /^(\s*group)\b\s*([\p{L}\p{N}_-]+)?\s*\{/iu.exec(text);
  if (group) {
    const start = group[1].length - 5;
    const symbol = structure(ctx, line, group[2] ? `group ${group[2]}` : "group", "group", start, start + 5);
    ctx.stack.push({ symbol, closer: "brace" });
    return;
  }
  if (/^\s*[\p{L}\p{N}_-]+\s*=/u.test(text)) return;
  const link = /^(\s*)([\p{L}\p{N}_-]+)\s*--\s*([\p{L}\p{N}_-]+)/u.exec(text);
  const node = link ?? /^(\s*)([\p{L}\p{N}_-]+)\s*(?:\[.*\])?\s*;?\s*$/u.exec(text);
  if (!node) return;
  const parent = ctx.stack.find((f) => f.symbol?.keyword === "network")?.symbol?.id;
  const declare = (name: string, start: number) =>
    builder.refer(index, name, line, { start, end: start + name.length, delimiter: "" }, { keyword: "node", category: "element", parent });
  declare(node[2], node[1].length);
  if (link) declare(link[3], link[0].length - link[3].length);
}

/* ---- Chen ER ----------------------------------------------------------- */

function chenLine(ctx: BlockContext, line: number, text: string): void {
  const { builder, index } = ctx;
  const trimmed = text.trim();
  if (trimmed.startsWith("}")) {
    if (ctx.memberOwner) {
      ctx.memberOwner.range = { ...ctx.memberOwner.range, endLine: line, endColumn: text.length };
      ctx.memberOwner = undefined;
    }
    return;
  }
  const decl = /^(\s*)(entity|relationship)\s+/i.exec(text);
  if (decl) {
    const form = parseNameForm(text, decl[0].length);
    if (!form) return;
    const keyword = decl[2].toLowerCase();
    const symbol = builder.declare({
      block: index,
      name: form.code.text,
      keyword,
      category: keyword === "entity" ? "class" : "type",
      line,
      span: form.code,
      label: form.label,
    });
    if (/\{\s*$/.test(trimmed) && ctx.info[line + 1]?.mode === "members") ctx.memberOwner = symbol;
    return;
  }
  const link = /^(\s*)([\p{L}\p{N}_]+)\s+[-=<>][^\s]*\s+([\p{L}\p{N}_]+)/u.exec(text);
  if (link) {
    builder.refer(index, link[2], line, { start: link[1].length, end: link[1].length + link[2].length, delimiter: "" });
    const start = link[0].length - link[3].length;
    builder.refer(index, link[3], line, { start, end: start + link[3].length, delimiter: "" });
  }
}

/* ---- Dispatch ---------------------------------------------------------- */

function dialectFor(kind: DiagramKind): ElementDialect | undefined {
  switch (kind) {
    case "class":
    case "object":
    case "er":
      return CLASS_DIALECT;
    case "state":
      return STATE_DIALECT;
    case "usecase":
    case "component":
    case "deployment":
    case "archimate":
      return DESCRIPTION_DIALECT;
    case "unknown":
    case "other":
      return GENERIC_DIALECT;
    default:
      return undefined;
  }
}

function extractBlock(ctx: BlockContext, scopes: CallableScope[]): void {
  const { block, lines, info } = ctx;
  const kind = block.kind;
  if (kind === "mindmap" || kind === "wbs") {
    treeBlock(ctx);
    return;
  }
  const dialect = dialectFor(kind);
  const last = block.closed ? block.endLine - 1 : block.endLine;
  let scopeIndex = 0;

  for (let line = block.startLine + 1; line <= last; line++) {
    const mode = info[line].mode;
    const text = lines[line];
    if (mode === "members") {
      if (ctx.memberOwner) addMember(ctx, ctx.memberOwner, line, text, 0);
      continue;
    }
    if (mode === "data" && kind === "ebnf") {
      const rule = /^(\s*)([\p{L}_][\p{L}\p{N}_ -]*?)\s*=/u.exec(text);
      if (rule) structure(ctx, line, rule[2], "rule", rule[1].length, rule[1].length + rule[2].length);
      continue;
    }
    if (mode !== "code") continue;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("!")) continue;
    if (/^title\s+\S/i.test(trimmed)) {
      ctx.title = trimmed.replace(/^title\s+/i, "");
      continue;
    }
    if (/^(?:skinparam|sprite|caption|header|footer|legend|scale|end\s*legend|end\s*title|end\s*header|end\s*footer|<\/?style>)/i.test(trimmed)) continue;

    while (scopeIndex < scopes.length && scopes[scopeIndex].endLine < line) scopeIndex++;
    const scope = scopes[scopeIndex];
    ctx.params = scope && scope.startLine < line && scope.params.size ? scope.params : undefined;
    collectStereotypes(ctx, text);

    if (dialect) elementLine(ctx, line, text, dialect);
    else if (kind === "sequence") sequenceLine(ctx, line, text);
    else if (kind === "activity") activityLine(ctx, line, text);
    else if (kind === "activity-legacy") legacyLine(ctx, line, text);
    else if (kind === "timing") timingLine(ctx, line, text);
    else if (kind === "gantt" || kind === "chronology") ganttLine(ctx, line, text);
    else if (kind === "nwdiag") nwdiagLine(ctx, line, text);
    else if (kind === "chen") chenLine(ctx, line, text);
  }
  // Anything still open (an unclosed block while typing) extends to the end.
  for (const frame of ctx.stack) {
    if (frame.symbol) frame.symbol.range = { ...frame.symbol.range, endLine: last, endColumn: lines[last]?.length ?? 0 };
  }
  if (ctx.memberOwner) ctx.memberOwner.range = { ...ctx.memberOwner.range, endLine: last, endColumn: lines[last]?.length ?? 0 };
}

/** Build the symbol index for a whole document. */
export function buildSymbolIndex(lines: string[], blocks: DiagramBlock[], info: LineInfo[]): SymbolIndex {
  const builder = new SymbolBuilder();
  const includes: string[] = [];
  const scopes = indexPreprocessor(builder, lines, info, includes);
  const stereotypes = new Set<string>();
  const blockTitles: (string | undefined)[] = [];

  blocks.forEach((block, index) => {
    const ctx: BlockContext = { builder, block, index, lines, info, stack: [], stereotypes };
    extractBlock(ctx, scopes);
    blockTitles.push(ctx.title);
  });

  const occurrencesByLine = new Map<number, Occurrence[]>();
  for (const symbol of builder.symbols) {
    symbol.occurrences.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn);
    for (const occ of symbol.occurrences) {
      const list = occurrencesByLine.get(occ.line);
      if (list) list.push(occ);
      else occurrencesByLine.set(occ.line, [occ]);
    }
  }
  for (const list of occurrencesByLine.values()) list.sort((a, b) => a.startColumn - b.startColumn);
  return { symbols: builder.symbols, occurrencesByLine, stereotypes: [...stereotypes].sort(), blockTitles, includes };
}
