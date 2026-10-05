import type { DiagramBlock, DiagramKind } from "./types";
import { scanLines, type LineInfo, type RawBlock } from "./lines";
import { arrowTraits, parseRelation, type Operand, type Relation } from "./relations";

const START = /^\s*@start(\w+)/i;
const END = /^\s*@end(\w+)/i;

const TAG_KINDS: Record<string, DiagramKind> = {
  mindmap: "mindmap",
  wbs: "wbs",
  gantt: "gantt",
  salt: "salt",
  json: "json",
  yaml: "yaml",
  ebnf: "ebnf",
  regex: "regex",
  chen: "chen",
  ditaa: "ditaa",
  dot: "dot",
  math: "math",
  latex: "latex",
  nwdiag: "nwdiag",
  chronology: "chronology",
};

/*
 * PlantUML decides what an @startuml block is by offering every line to each
 * diagram parser in a fixed order and keeping the first parser that accepts
 * them all. The detection below mirrors that: each statement is mapped to the
 * set of parsers that would accept it, and the earliest parser accepting the
 * most statements wins. The bit order is PlantUML's parser order.
 */
const SEQ = 1;
const CLS = 2;
const LEGACY = 4;
const DESC = 8;
const STATE = 16;
const ACT = 32;
const TIMING = 64;
const GANTT = 128;
const ALL = 255;
const ORDER = [SEQ, CLS, LEGACY, DESC, STATE, ACT, TIMING, GANTT];

const NEUTRAL =
  /^(?:skinparam|title|caption|header|footer|legend|end\s*legend|end\s*title|end\s*header|end\s*footer|scale|hide|show|remove|restore|sprite|left to right direction|top to bottom direction|mainframe|newpage|allow_?mixing|together|end\s*[hr]?note|[hr]?note|floating\s+note|skin|<\/?style|\}|\]|url)\b/i;
const NEUTRAL_EXACT = /^(?:\}|\]|<\/?style>.*)$/i;

const SEQUENCE_ONLY =
  /^(?:participant|activate|deactivate|destroy|create|autonumber|autoactivate|autonewpage|return|alt|opt|loop|par|par2|critical|ref|box|end\s*box|end\s*ref)\b|^\.\.\.|^\|\|\||^\|\|\d+\|\||^={2}[^=].*={2}$/i;
const PARTICIPANT_TYPES = /^(actor|boundary|control|entity|database|collections|queue)\b(\/?)/i;
const CLASS_ONLY =
  /^(?:abstract\s+class|abstract|static\s+class|class|annotation|enum|struct|exception|metaclass|protocol|object|map|json|dataclass|record|namespace|diamond)\b/i;
const DESC_ONLY =
  /^(?:usecase|component|node|cloud|artifact|folder|frame|storage|agent|file|hexagon|label|stack|person|process|action|port|portin|portout|archimate)\b/i;
const ACTIVITY_ONLY =
  /^(?:start|stop|kill|detach|if\s*\(|elseif\s*\(|endif|while\s*\(|endwhile|end\s*while|repeat|backward|fork|end\s*fork|endfork|split|end\s*split|endsplit|switch\s*\(|case\s*\(|endswitch|end\s*merge|merge|goto|\(\w\))\b|^\|[^|]+\|/i;
const TIMING_ONLY = /^(?:(?:compact\s+)?(?:robust|concise)|clock|binary|analog|highlight)\b|^@\S|^[+-]?\d[\d.:]*\s+is\b/i;
const GANTT_ONLY =
  /^\[[^\]]+\]\s+(?:as\s+\[|(?:lasts|requires|starts|ends|happens|occurs|is|are|on|pauses|links|displays)\b)|^then\s+\[|^project\s+(?:starts|scale|is)|^(?:projectscale|printscale|ganttscale)\b|^(?:mon|tues|wednes|thurs|fri|satur|sun)days?\s+(?:are|is)\b|^today\s+is\b|^\{[^}]+\}\s+is\b|^\d{4}[-/]\d\d[-/]\d\d\s+(?:is|to)\b|^language\s+\w+$/i;

function operandMask(ops: Operand[]): number {
  let mask = ALL;
  for (const op of ops) {
    if (op.pseudo) mask &= op.delimiter === "[" ? STATE : LEGACY;
    else if (op.delimiter === "(") mask &= ops.length > 1 ? CLS : DESC;
    else if (op.delimiter === ":" || op.delimiter === "[") mask &= DESC | (op.delimiter === "[" ? GANTT : 0);
    else if (op.delimiter === '"') mask &= SEQ | CLS | LEGACY | DESC;
  }
  return mask;
}

function relationMask(t: string, rel: Relation): number {
  if (rel.openLeft && rel.left.length === 0 && !/^[[?]/.test(t)) {
    // `-> label;` is an activity arrow, `--> "next"` the legacy activity form.
    return /;\s*$/.test(t) ? ACT : LEGACY | ACT;
  }
  if (/^[[?]/.test(t) && rel.openLeft) return SEQ;
  if (rel.openRight) return SEQ;
  let mask = operandMask(rel.left) & operandMask(rel.right);
  const traits = arrowTraits(rel.arrow.text);
  let arrowMask = CLS | DESC;
  if (traits.crowfoot) arrowMask = CLS;
  if (traits.sequence) arrowMask |= SEQ;
  if (traits.state) arrowMask |= STATE | LEGACY;
  // Gantt links tasks with a plain arrow between bracketed names.
  if (traits.state && rel.left[0]?.delimiter === "[") arrowMask |= GANTT;
  mask &= arrowMask;
  if (/^\s*(?:\+\+|--|\*\*|!!)/.test(t.slice(rel.rest))) mask &= SEQ;
  return mask;
}

/** The set of diagram parsers that would accept this statement (ALL = says nothing). */
function statementMask(t: string): number {
  if (NEUTRAL.test(t) || NEUTRAL_EXACT.test(t) || t.startsWith("!")) return ALL;
  const rel = parseRelation(t);
  // A name that happens to spell a keyword (`Box --> DB`) is still a relation.
  if (rel && rel.left.length > 0 && rel.right.length > 0) return relationMask(t, rel);
  if (SEQUENCE_ONLY.test(t)) return SEQ;
  if (GANTT_ONLY.test(t)) return GANTT;
  if (TIMING_ONLY.test(t)) return TIMING;
  const lower = t.toLowerCase();

  if (/^={3}/.test(t) || t.includes("(*)") || /^if\s+"/i.test(t)) return LEGACY;
  if (/^(?:else|endif)\b/i.test(t)) return SEQ | LEGACY | ACT;
  if (/^(?:break|group)\b/i.test(t)) return SEQ | ACT;
  if (/^end\b/i.test(t)) return SEQ | ACT;
  if (/^partition\b/i.test(t)) return SEQ | LEGACY | ACT;
  if (ACTIVITY_ONLY.test(t)) return ACT;
  if (/^(?:#\w+)?:/.test(t)) {
    return /^:[^:]+:\s*(?:$|as\b|<<|#|[-.<=~*o+^x])/.test(t) && !/;$/.test(t) ? DESC : ACT;
  }

  const participant = PARTICIPANT_TYPES.exec(t);
  if (participant) {
    const word = participant[1].toLowerCase();
    if (participant[2]) return DESC;
    if (/\{\s*$/.test(t)) return word === "entity" ? CLS : DESC;
    return word === "entity" ? SEQ | CLS | DESC : SEQ | DESC;
  }
  if (CLASS_ONLY.test(t)) return CLS;
  if (/^(?:interface|circle)\b/i.test(t)) return CLS | DESC;
  if (/^\(\)/.test(t)) return CLS | DESC;
  if (/^package\b/i.test(t)) return CLS | DESC | STATE | ACT;
  if (/^(?:rectangle|card)\b/i.test(t)) return /\{\s*$/.test(t) ? DESC | ACT : DESC;
  if (DESC_ONLY.test(t) || /^(?:usecase|actor)\//i.test(t)) return DESC;
  if (/^state\b/i.test(lower)) return STATE;
  if (/^(?:--+|\|\|+)$/.test(t)) return STATE;

  if (rel && (rel.right.length > 0 || rel.openRight)) return relationMask(t, rel);
  if (/^\([^)]+\)/.test(t)) return t.includes(",") ? CLS : DESC;
  if (/^\[[^\]]+\]/.test(t)) return /^\[(?:\*|H\*?)\]/.test(t) ? STATE : DESC;
  // `Name : text` adds a member to a class or a description to a state.
  if (/^[\p{L}\p{N}_.]+\s*:\s*\S/u.test(t)) return CLS | STATE;
  return ALL;
}

interface Tally {
  counts: number[];
  significant: number;
}

function refineClass(statements: string[]): DiagramKind {
  let classLike = false;
  let entity = false;
  let objectLike = false;
  let crowfoot = false;
  for (const t of statements) {
    if (/^(?:abstract|class|interface|enum|annotation|struct|exception|metaclass|protocol|dataclass|record)\b/i.test(t)) classLike = true;
    else if (/^entity\b/i.test(t)) entity = true;
    else if (/^(?:object|map|json)\b/i.test(t)) objectLike = true;
    else if (/[|}]o--|--o[|{]|\|\|--|--\|\||[}|]\|--|--\|[{|]|\|\|\.\.|\.\.\|\||[|}]o\.\.|\.\.o[|{]/.test(t)) crowfoot = true;
  }
  if (classLike) return "class";
  if (entity || crowfoot) return "er";
  if (objectLike) return "object";
  return "class";
}

function refineDescription(statements: string[]): DiagramKind {
  let usecase = 0;
  let component = 0;
  let deployment = 0;
  let actor = 0;
  for (const t of statements) {
    if (/^archimate\b/i.test(t) || /^!include\s+<archimate/i.test(t)) return "archimate";
    if (/^usecase\b/i.test(t) || /(?:^|\s)\((?!\))[^)]+\)/.test(t)) usecase++;
    if (/^(?:component|interface|port|portin|portout)\b|^\(\)|(?:^|\s)\[[^\]]+\]/i.test(t)) component++;
    if (/^(?:node|artifact|cloud|storage|agent|file|stack|hexagon|person|card|process|database|queue|folder|frame)\b/i.test(t)) deployment++;
    if (/^actor\b|^:[^:]+:/i.test(t)) actor++;
  }
  if (usecase > 0 && usecase >= component && usecase >= deployment) return "usecase";
  if (component > 0 && component >= deployment) return "component";
  if (deployment > 0) return "deployment";
  return actor > 0 ? "usecase" : "deployment";
}

function detectFromStatements(statements: string[], hasMembers: boolean): DiagramKind {
  const first = statements.find((t) => !t.startsWith("!") && !NEUTRAL.test(t));
  if (first) {
    if (/^salt\b/i.test(first) || first === "{") return "salt";
    if (/^nwdiag\s*\{/i.test(first)) return "nwdiag";
  }
  const tally: Tally = { counts: ORDER.map(() => 0), significant: 0 };
  for (const t of statements) {
    const mask = statementMask(t);
    if (mask === ALL) continue;
    tally.significant++;
    ORDER.forEach((bit, i) => {
      if (mask & bit) tally.counts[i]++;
    });
  }
  if (tally.significant === 0) return hasMembers ? "class" : "unknown";
  let best = 0;
  for (let i = 1; i < ORDER.length; i++) if (tally.counts[i] > tally.counts[best]) best = i;
  switch (ORDER[best]) {
    case SEQ:
      return "sequence";
    case CLS:
      return refineClass(statements);
    case LEGACY:
      return "activity-legacy";
    case DESC:
      return refineDescription(statements);
    case STATE:
      return "state";
    case ACT:
      return "activity";
    case TIMING:
      return "timing";
    default:
      return "gantt";
  }
}

function statementsOf(lines: string[], info: LineInfo[], from: number, to: number): { statements: string[]; hasMembers: boolean } {
  const statements: string[] = [];
  let hasMembers = false;
  for (let i = from; i <= to; i++) {
    const mode = info[i]?.mode;
    if (mode === "members") hasMembers = true;
    if (mode !== "code") continue;
    const t = lines[i].trim();
    if (t) statements.push(t);
  }
  return { statements, hasMembers };
}

/**
 * Guess what kind of diagram an `@startuml` body is (the lines between the
 * tags, without them).
 */
export function detectUmlKind(lines: string[]): DiagramKind {
  if (lines.length === 0) return "unknown";
  // Scan as an unclosed block whose (absent) start tag sits just before line 0.
  const padded = ["@startuml", ...lines];
  const info = scanLines(padded, [{ tag: "uml", startLine: 0, endLine: padded.length - 1, closed: false }]);
  const { statements, hasMembers } = statementsOf(padded, info, 1, padded.length - 1);
  return detectFromStatements(statements, hasMembers);
}

export interface ParsedDocument {
  blocks: DiagramBlock[];
  /** One entry per line. */
  lineInfo: LineInfo[];
}

function findRawBlocks(lines: string[]): RawBlock[] {
  const raw: RawBlock[] = [];
  let open: { tag: string; startLine: number } | null = null;
  const close = (endLine: number, closed: boolean) => {
    if (!open) return;
    raw.push({ tag: open.tag, startLine: open.startLine, endLine, closed });
    open = null;
  };
  lines.forEach((line, i) => {
    if (line.indexOf("@") < 0) return;
    const start = START.exec(line);
    if (start) {
      // A new @start before the previous block ended closes it implicitly.
      close(i - 1, false);
      open = { tag: start[1].toLowerCase(), startLine: i };
    } else if (open && END.test(line)) {
      close(i, true);
    }
  });
  close(lines.length - 1, false);
  return raw;
}

/** Split a document into blocks and classify every line. */
export function parseDocument(lines: string[]): ParsedDocument {
  const raw = findRawBlocks(lines);
  const lineInfo = scanLines(lines, raw);
  const blocks = raw.map((block): DiagramBlock => {
    let kind: DiagramKind;
    if (block.tag === "uml") {
      const { statements, hasMembers } = statementsOf(lines, lineInfo, block.startLine + 1, block.endLine);
      kind = detectFromStatements(statements, hasMembers);
    } else {
      kind = TAG_KINDS[block.tag] ?? "other";
    }
    return { tag: block.tag, kind, startLine: block.startLine, endLine: block.endLine, closed: block.closed };
  });
  return { blocks, lineInfo };
}

/** Split a document into its @start…/@end… blocks. */
export function parseBlocks(lines: string[]): DiagramBlock[] {
  return parseDocument(lines).blocks;
}

export function blockAtLine(blocks: DiagramBlock[], line: number): DiagramBlock | undefined {
  return blocks.find((b) => line >= b.startLine && line <= b.endLine);
}
