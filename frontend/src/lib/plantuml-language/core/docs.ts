import type { DiagramKind, DocEntry } from "./types";
import { type DocRecord, normalizeTerm } from "./docs-model";
import { activityDocs } from "./docs-activity";
import { builtinDocs } from "./docs-builtins";
import { classDocs } from "./docs-class";
import { commonDocs } from "./docs-common";
import { creoleDocs } from "./docs-creole";
import { dataDocs } from "./docs-data";
import { descriptionDocs } from "./docs-description";
import { erDocs } from "./docs-er";
import { ganttDocs } from "./docs-gantt";
import { mindmapDocs } from "./docs-mindmap";
import { preprocessorDocs } from "./docs-preprocessor";
import { saltDocs } from "./docs-salt";
import { sequenceDocs } from "./docs-sequence";
import { generatedSkinparamDocs, skinparamDocs } from "./docs-skinparam";
import { stateDocs } from "./docs-state";
import { styleDocs } from "./docs-style";
import { tagDocs } from "./docs-tags";
import { timingDocs } from "./docs-timing";

/**
 * Hand-written entries, in priority order: when a term has several entries
 * and none matches the requested diagram kind (and none is kind-less), the
 * first one listed here wins.
 */
const HANDWRITTEN: DocRecord[] = [
  ...commonDocs,
  ...sequenceDocs,
  ...classDocs,
  ...descriptionDocs,
  ...stateDocs,
  ...erDocs,
  ...activityDocs,
  ...timingDocs,
  ...ganttDocs,
  ...mindmapDocs,
  ...saltDocs,
  ...dataDocs,
  ...tagDocs,
  ...preprocessorDocs,
  ...builtinDocs,
  ...creoleDocs,
  ...skinparamDocs,
  ...styleDocs,
];

/**
 * Kinds whose syntax is shared closely enough that an entry written for one
 * is the right answer for the other when no exact match exists.
 */
const KIN: Partial<Record<DiagramKind, DiagramKind[]>> = {
  object: ["class"],
  er: ["class"],
  class: ["object", "er"],
  usecase: ["component", "deployment"],
  component: ["deployment", "usecase"],
  deployment: ["component", "usecase"],
  archimate: ["component", "deployment"],
  "activity-legacy": ["activity"],
  wbs: ["mindmap"],
  mindmap: ["wbs"],
  yaml: ["json"],
  json: ["yaml"],
};

let index: Map<string, DocRecord[]> | undefined;

function getIndex(): Map<string, DocRecord[]> {
  if (index) return index;
  index = new Map();
  // Generated skinparam entries go last so hand-written ones take precedence.
  for (const record of [...HANDWRITTEN, ...generatedSkinparamDocs()]) {
    for (const term of record.terms) {
      const key = normalizeTerm(term);
      const list = index.get(key);
      if (list) list.push(record);
      else index.set(key, [record]);
    }
  }
  return index;
}

function candidates(term: string): DocRecord[] | undefined {
  const idx = getIndex();
  const key = normalizeTerm(term);
  if (!key) return undefined;
  const direct = idx.get(key);
  if (direct) return direct;
  // Directives, builtin functions and diagram tags are indexed with their
  // sigil; accept the bare word when it has no meaning of its own.
  for (const sigil of ["!", "%", "@"]) {
    const prefixed = idx.get(sigil + key);
    if (prefixed) return prefixed;
  }
  return undefined;
}

function pick(records: DocRecord[], kind?: DiagramKind): DocRecord {
  if (kind) {
    const exact = records.find((r) => r.kinds?.includes(kind));
    if (exact) return exact;
    const kin = KIN[kind];
    const related = kin && records.find((r) => r.kinds?.some((k) => kin.includes(k)));
    if (related) return related;
  }
  return records.find((r) => !r.kinds) ?? records[0];
}

function toEntry(record: DocRecord): DocEntry {
  const entry: DocEntry = { body: record.body };
  if (record.signature) entry.signature = record.signature;
  if (record.example) entry.example = record.example;
  if (record.link) entry.link = record.link;
  return entry;
}

/**
 * Documentation for a word (keyword, element type, "!directive", "%builtin",
 * skinparam, "@starttag"), optionally specialised by the diagram kind it
 * appears in. Terms are matched case-insensitively.
 */
export function lookupDoc(term: string, kind?: DiagramKind): DocEntry | undefined {
  const records = candidates(term);
  return records && toEntry(pick(records, kind));
}

/**
 * Like lookupDoc, but only answers when the term is documented for that
 * diagram kind (or a closely related one) or has a kind-independent meaning.
 * Useful for hover, where a word such as "lasts" inside a sequence message
 * should not show Gantt documentation.
 */
export function lookupDocStrict(term: string, kind: DiagramKind): DocEntry | undefined {
  const records = candidates(term);
  if (!records) return undefined;
  const picked = pick(records, kind);
  const kin = KIN[kind] ?? [];
  const applies = !picked.kinds || picked.kinds.some((k) => k === kind || kin.includes(k));
  return applies ? toEntry(picked) : undefined;
}

/** Every documentation record, including generated ones (for tests and validation). */
export function allDocRecords(): DocRecord[] {
  return [...HANDWRITTEN, ...generatedSkinparamDocs()];
}

/** Every indexed term, normalised (for tests). */
export function allDocTerms(): string[] {
  return [...getIndex().keys()];
}
