import type { DiagramKind } from "./types";
import { type Analysis, preprocessorSymbols, referableSymbols } from "./analysis";
import { colorHex } from "./colors";
import { completionContext, type CompletionContext } from "./context";
import {
  arrowsFor,
  BUILTIN_FUNCTIONS,
  builtinSignature,
  CREOLE_TAGS,
  openersFor,
  PRAGMAS,
  STYLE_PROPERTIES,
  STYLE_SELECTORS,
  valueChoices,
} from "./facts";
import { codeBlock, docMarkdown } from "./render";
import { snippets } from "./snippets";
import { stdlibIncludePaths, stdlibMacrosFor, type StdlibMacro } from "./stdlib";
import type { PumlSymbol } from "./symbols";
import { vocab } from "../vocab";

export type CompletionCategory =
  | "keyword"
  | "snippet"
  | "symbol"
  | "arrow"
  | "skinparam"
  | "color"
  | "directive"
  | "theme"
  | "include"
  | "builtin"
  | "function"
  | "variable"
  | "icon"
  | "emoji"
  | "stereotype"
  | "style"
  | "tag"
  | "value"
  | "creole";

export interface CompletionEntry {
  label: string;
  category: CompletionCategory;
  insertText: string;
  /** `insertText` uses snippet syntax ($1, ${2:placeholder}). */
  snippet?: boolean;
  detail?: string;
  /** Markdown. */
  documentation?: string;
  /** Term to look up lazily for documentation (large lists skip eager lookup). */
  docTerm?: string;
  sortText: string;
  filterText?: string;
  /** `#rrggbb` for colour items. */
  color?: string;
  /** Reopen the suggestion list after inserting (arrow, then the name that follows). */
  retrigger?: boolean;
}

export interface CompletionList {
  context: CompletionContext;
  /** Columns of the text an accepted item replaces. */
  start: number;
  end: number;
  items: CompletionEntry[];
}

export interface CompletionOptions {
  /** The character that triggered completion, if any. */
  trigger?: string;
}

const rank = (group: number, index: number) => `${group}${String(index).padStart(4, "0")}`;

function snippetKinds(kind: DiagramKind): DiagramKind[] {
  // An unclassified block can still become anything: offer the mainstream UML sets.
  return kind === "unknown" || kind === "other"
    ? ["sequence", "class", "usecase", "component", "state", "activity"]
    : [kind];
}

function snippetEntries(kind: DiagramKind | "top", group: number): CompletionEntry[] {
  const kinds = kind === "top" ? [] : snippetKinds(kind);
  const out: CompletionEntry[] = [];
  snippets.forEach((snippet, i) => {
    const scope = snippet.scope;
    const applies =
      kind === "top" ? scope === "top" : scope === "any" || (Array.isArray(scope) && scope.some((k) => kinds.includes(k)));
    if (!applies) return;
    out.push({
      label: snippet.prefix,
      category: "snippet",
      insertText: snippet.body,
      snippet: true,
      detail: snippet.description,
      documentation: codeBlock(snippet.body.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, "$1").replace(/\$\d+/g, "").replace(/\\\$/g, "$")),
      sortText: rank(group, i),
    });
  });
  return out;
}

function escapeSnippet(text: string): string {
  return text.replace(/[\\$}]/g, "\\$&");
}

/** A name as it must be written to refer to `symbol`. */
function writtenName(symbol: PumlSymbol): string {
  const delimiter = symbol.declaration.delimiter;
  if (symbol.keyword === "task" || symbol.keyword === "milestone") return `[${symbol.name}]`;
  if (symbol.keyword === "resource") return `{${symbol.name}}`;
  if (symbol.keyword === "swimlane") return `|${symbol.name}|`;
  if (symbol.label !== undefined) return /^[\p{L}\p{N}_.@]+$/u.test(symbol.name) ? symbol.name : `"${symbol.name}"`;
  if (delimiter === '"') return `"${symbol.name}"`;
  if (delimiter === "(") return `(${symbol.name})`;
  if (delimiter === "[") return `[${symbol.name}]`;
  if (delimiter === ":") return `:${symbol.name}:`;
  return symbol.name;
}

const CLOSERS: Record<string, string> = { "[": "]", "(": ")", "{": "}", "|": "|" };

function symbolDetail(symbol: PumlSymbol): string {
  const label = symbol.label !== undefined ? ` "${symbol.label}"` : "";
  return `${symbol.keyword}${label}${symbol.implicit ? " (first used on line " + (symbol.declaration.line + 1) + ")" : ""}`;
}

function symbolEntries(
  analysis: Analysis,
  block: number,
  group: number,
  options: { opener?: string; only?: "task" | "resource" | "swimlane"; after?: string; cursor?: { line: number; column: number } },
): CompletionEntry[] {
  const out: CompletionEntry[] = [];
  const closer = options.opener ? CLOSERS[options.opener] : undefined;
  const cursor = options.cursor;
  for (const symbol of referableSymbols(analysis, block)) {
    if (symbol.category === "parameter") continue;
    // A name that exists only because it is being typed right now is not a suggestion.
    const only = symbol.occurrences.length === 1 ? symbol.occurrences[0] : undefined;
    if (only && cursor && only.line === cursor.line && only.startColumn <= cursor.column && cursor.column <= only.endColumn) continue;
    const isTask = symbol.keyword === "task" || symbol.keyword === "milestone";
    if (options.only === "task" && !isTask) continue;
    if (options.only === "resource" && symbol.keyword !== "resource") continue;
    if (options.only === "swimlane" && symbol.keyword !== "swimlane") continue;
    if (!options.only && symbol.keyword === "swimlane" && !options.opener) continue;
    const written = writtenName(symbol);
    let insertText = written;
    if (options.opener) {
      const matches =
        written.startsWith(options.opener) ||
        (options.opener === "(" && symbol.keyword === "usecase") ||
        (options.opener === "[" && symbol.keyword === "component");
      if (!matches) continue;
      insertText = symbol.name + (closer && options.after !== closer ? closer : "");
    }
    out.push({
      label: options.opener ? symbol.name : written,
      category: "symbol",
      insertText,
      detail: symbolDetail(symbol),
      filterText: options.opener ? symbol.name : written,
      sortText: rank(group, out.length),
    });
  }
  return out;
}

function callableSnippet(name: string, params: { name: string; defaultValue?: string }[]): string {
  if (params.length === 0) return `${escapeSnippet(name)}()`;
  const required = params.filter((p) => p.defaultValue === undefined);
  const shown = required.length > 0 ? required : params.slice(0, 1);
  const args = shown.map((p, i) => `\${${i + 1}:${escapeSnippet(p.name.replace(/^\$/, ""))}}`);
  return `${escapeSnippet(name)}(${args.join(", ")})`;
}

function preprocessorEntries(analysis: Analysis, line: number, group: number, filter: (s: PumlSymbol) => boolean): CompletionEntry[] {
  const out: CompletionEntry[] = [];
  const add = (symbol: PumlSymbol) => {
    const callable = symbol.parameters !== undefined && symbol.detail?.includes("(");
    out.push({
      label: symbol.name,
      category: symbol.category === "variable" || symbol.category === "parameter" || symbol.category === "sprite" ? "variable" : "function",
      insertText: callable ? callableSnippet(symbol.name, symbol.parameters ?? []) : symbol.name,
      snippet: callable || undefined,
      detail:
        symbol.category === "parameter"
          ? "parameter"
          : symbol.category === "variable"
            ? `variable${symbol.detail ? " = " + symbol.detail : ""}`
            : `${symbol.keyword} ${symbol.detail ?? symbol.name}`,
      sortText: rank(group, out.length),
    });
  };
  for (const symbol of analysis.symbols) {
    if (symbol.category === "parameter" && symbol.scope && line > symbol.scope.startLine && line <= symbol.scope.endLine && filter(symbol)) add(symbol);
  }
  for (const symbol of preprocessorSymbols(analysis)) if (filter(symbol)) add(symbol);
  return out;
}

function stdlibEntries(macros: StdlibMacro[], group: number): CompletionEntry[] {
  return macros.map((macro, i) => ({
    label: macro.name,
    category: "function" as const,
    insertText: callableSnippet(macro.name, macro.params.map((p) => ({ name: p.name, defaultValue: p.optional ? "" : undefined }))),
    snippet: true,
    detail: `${macro.library} ${macro.name}(${macro.params.map((p) => p.name).join(", ")})`,
    sortText: rank(group, i),
  }));
}

function colorEntries(group: number): CompletionEntry[] {
  // The ALL-CAPS names are ArchiMate layer colours; keep them out of the way of the everyday ones.
  const ordered = [...vocab.colors.filter((name) => name !== name.toUpperCase()), ...vocab.colors.filter((name) => name === name.toUpperCase())];
  return ordered.map((name, i) => {
    const hex = colorHex(name);
    return { label: name, category: "color" as const, insertText: name, detail: hex, documentation: hex, color: hex, sortText: rank(group, i) };
  });
}

/** Skinparam name prefixes that style the elements of a diagram kind, listed first in that kind. */
const SKINPARAM_PREFIXES: Partial<Record<DiagramKind, string[]>> = {
  sequence: ["Sequence", "Participant", "Actor", "Boundary", "Control", "Entity", "Database", "Collections", "Queue", "Arrow", "Note"],
  class: ["Class", "Interface", "Enum", "Package", "Stereotype", "Circled", "Arrow", "Note"],
  object: ["Object", "Map", "Package", "Arrow", "Note"],
  er: ["Class", "Entity", "Arrow", "Note"],
  usecase: ["Usecase", "Actor", "Rectangle", "Package", "Arrow", "Note"],
  activity: ["Activity", "Partition", "Swimlane", "Arrow", "Note"],
  "activity-legacy": ["Activity", "Partition", "Arrow", "Note"],
  state: ["State", "Arrow", "Note"],
  component: ["Component", "Interface", "Package", "Node", "Database", "Cloud", "Rectangle", "Folder", "Frame", "Arrow", "Note"],
  deployment: ["Node", "Database", "Cloud", "Artifact", "Component", "Storage", "Queue", "Stack", "Rectangle", "Folder", "Frame", "Agent", "Arrow", "Note"],
  timing: ["Timing", "Arrow", "Note"],
  archimate: ["Archimate", "Rectangle", "Arrow", "Note"],
};

/** Diagram tags in rough order of use, so `@startm` + Enter gives a mindmap rather than `@startmath`. */
const COMMON_TAGS = ["uml", "mindmap", "gantt", "wbs", "json", "yaml", "salt", "nwdiag", "chen", "ebnf", "regex", "ditaa", "dot", "math", "latex"];

function startTagEntries(group: number, wrap: boolean): CompletionEntry[] {
  const tags = [...COMMON_TAGS.filter((t) => vocab.startTags.includes(t)), ...vocab.startTags.filter((t) => !COMMON_TAGS.includes(t))];
  return tags.map((tag, i) => ({
    label: `@start${tag}`,
    category: "tag" as const,
    insertText: wrap ? `@start${tag}\n$0\n@end${tag}` : `@start${tag}`,
    snippet: wrap || undefined,
    detail: wrap ? `@start${tag} … @end${tag}` : undefined,
    documentation: docMarkdown(`@start${tag}`),
    sortText: rank(group, i),
  }));
}

const NOTE_WORDS: Partial<Record<DiagramKind, string[]>> = {
  // Bare sides first: `note right` + Enter (a multi-line note) must not turn into `note right of`.
  sequence: ["left", "right", "over", "left of", "right of", "across"],
  activity: ["left", "right"],
  "activity-legacy": ["left", "right", "top", "bottom"],
  gantt: ["bottom"],
  timing: ["top of", "bottom of"],
};
const NOTE_DEFAULT = ["left of", "right of", "top of", "bottom of", "as"];

const HIDE_WORDS: Partial<Record<DiagramKind, string[]>> = {
  sequence: ["footbox", "unlinked"],
  class: ["empty members", "empty fields", "empty methods", "members", "fields", "methods", "circle", "stereotype", "@unlinked"],
  object: ["empty members", "empty fields", "members", "fields", "circle", "stereotype", "@unlinked"],
  er: ["empty members", "circle", "stereotype", "@unlinked"],
  state: ["empty description"],
  gantt: ["footbox", "resources names", "resources footbox"],
  timing: ["time-axis"],
};

const GANTT_VERBS: { label: string; body: string; description: string }[] = [
  { label: "lasts", body: "lasts ${1:5} days", description: "Duration of the task" },
  { label: "starts", body: "starts ${1:2026-01-05}", description: "Start on a date" },
  { label: "starts at", body: "starts at [${1:Task}]'s end", description: "Start when another task ends" },
  { label: "starts after", body: "starts ${1:2} days after [${2:Task}]'s end", description: "Start some days after another task" },
  { label: "ends", body: "ends ${1:2026-01-16}", description: "End on a date" },
  { label: "ends at", body: "ends at [${1:Task}]'s end", description: "End when another task ends" },
  { label: "happens", body: "happens ${1:2026-01-16}", description: "Milestone on a date" },
  { label: "happens at", body: "happens at [${1:Task}]'s end", description: "Milestone when a task ends" },
  { label: "is colored in", body: "is colored in ${1:LightBlue}", description: "Bar colour" },
  { label: "is % completed", body: "is ${1:50}% completed", description: "Progress" },
  { label: "on {resource}", body: "on {${1:Alice}} lasts ${2:5} days", description: "Assign a resource" },
  { label: "as [alias]", body: "as [${1:T1}] lasts ${2:5} days", description: "Short alias for later references" },
  { label: "pauses on", body: "pauses on ${1:2026-01-08}", description: "Day the task is not worked on" },
  { label: "displays on same row as", body: "displays on same row as [${1:Task}]", description: "Share a row with another task" },
  { label: "requires", body: "requires ${1:5} days", description: "Workload of the task (same as lasts)" },
  { label: "is deleted", body: "is deleted", description: "Strike the task out" },
];

const NWDIAG_ATTRIBUTES = ['address = "${1:10.0.0.1}"', 'description = "${1:text}"', "shape = ${1|node,database,cloud,actor,storage,queue,folder,component|}", 'color = "${1:#LightBlue}"'];

const DIRECTIVE_SNIPPETS: Record<string, string> = {
  procedure: "!procedure \\$${1:name}(\\$${2:arg})\n\t$0\n!endprocedure",
  function: "!function \\$${1:name}(\\$${2:arg})\n\t!return ${3:\\$arg}\n!endfunction",
  if: "!if (${1:condition})\n\t$0\n!endif",
  ifdef: "!ifdef ${1:NAME}\n\t$0\n!endif",
  ifndef: "!ifndef ${1:NAME}\n\t$0\n!endif",
  while: "!while (${1:condition})\n\t$0\n!endwhile",
  foreach: "!foreach \\$${1:item} in ${2:[1, 2, 3]}\n\t$0\n!endfor",
  definelong: "!definelong ${1:NAME}(${2:arg})\n$0\n!enddefinelong",
  startsub: "!startsub ${1:NAME}\n$0\n!endsub",
  define: "!define ${1:NAME} ${2:value}",
  include: "!include ${1:file.puml}",
  theme: "!theme ${1:plain}",
  pragma: "!pragma ${1:teoz true}",
  log: "!log ${1:message}",
  assert: "!assert ${1:condition} : \"${2:message}\"",
};

const STATE_STEREOTYPES = ["choice", "fork", "join", "end", "start", "entryPoint", "exitPoint", "inputPin", "outputPin", "expansionInput", "expansionOutput", "history", "history*", "sdlreceive"];

function entriesFor(analysis: Analysis, context: CompletionContext, line: number, column: number): CompletionEntry[] {
  const lineText = analysis.lines[line] ?? "";
  const after = lineText[column];
  switch (context.kind) {
    case "none":
      return [];
    case "top":
      return [...startTagEntries(1, true), ...snippetEntries("top", 2)];
    case "tag": {
      const block = analysis.blocks[context.block];
      if (!block) return startTagEntries(1, true);
      const onStartLine = line === block.startLine;
      if (onStartLine) return startTagEntries(1, false);
      const end: CompletionEntry = {
        label: `@end${block.tag}`,
        category: "tag",
        insertText: `@end${block.tag}`,
        detail: `Close the @start${block.tag} block`,
        sortText: rank(0, 0),
      };
      const players =
        block.kind === "timing"
          ? referableSymbols(analysis, context.block).map((s, i): CompletionEntry => ({
              label: `@${s.name}`,
              category: "symbol",
              insertText: `@${s.name}`,
              detail: `Describe ${symbolDetail(s)} on its own timeline`,
              sortText: rank(1, i),
            }))
          : [];
      return [end, ...players, ...(block.closed ? [] : startTagEntries(2, true))];
    }
    case "line-start": {
      const kind = analysis.blocks[context.block]?.kind ?? "unknown";
      const symbolsFirst = kind === "sequence" || kind === "state" || kind === "timing" || kind === "gantt" || kind === "nwdiag";
      const openers = openersFor(kind).map((word, i): CompletionEntry => ({
        label: word,
        category: "keyword",
        insertText: word,
        documentation: docMarkdown(word, kind) ?? docMarkdown(word.split(" ")[0], kind),
        sortText: rank(symbolsFirst ? 2 : 1, i),
      }));
      const pseudo: CompletionEntry[] =
        kind === "state"
          ? [{ label: "[*]", category: "symbol", insertText: "[*]", detail: "Initial / final state", sortText: rank(symbolsFirst ? 1 : 2, 0) }]
          : kind === "activity-legacy"
            ? [{ label: "(*)", category: "symbol", insertText: "(*)", detail: "Start / end point", sortText: rank(1, 0) }]
            : [];
      const macros = preprocessorEntries(analysis, line, 3, (s) => s.category === "macro" || s.category === "function");
      const stdlib = stdlibEntries(stdlibMacrosFor(analysis.includes), 4);
      return [
        ...pseudo,
        ...symbolEntries(analysis, context.block, symbolsFirst ? 1 : 2, { cursor: { line, column } }),
        ...openers,
        ...macros,
        ...stdlib,
        ...snippetEntries(kind, 5),
      ];
    }
    case "name": {
      const kind = analysis.blocks[context.block]?.kind ?? "unknown";
      const pseudo: CompletionEntry[] =
        kind === "state" && !context.opener
          ? [{ label: "[*]", category: "symbol", insertText: "[*]", detail: "Initial / final state", sortText: rank(2, 0) }]
          : kind === "activity-legacy" && !context.opener
            ? [{ label: "(*)", category: "symbol", insertText: "(*)", detail: "Start / end point", sortText: rank(2, 0) }]
            : [];
      return [...symbolEntries(analysis, context.block, 1, { opener: context.opener || undefined, only: context.only, after, cursor: { line, column } }), ...pseudo];
    }
    case "arrow": {
      const kind = analysis.blocks[context.block]?.kind ?? "unknown";
      return arrowsFor(kind).map((fact, i) => ({
        label: fact.arrow,
        category: "arrow" as const,
        insertText: `${fact.arrow} `,
        detail: fact.description,
        filterText: fact.arrow,
        sortText: rank(1, i),
        retrigger: true,
      }));
    }
    case "continuation": {
      const kind = analysis.blocks[context.block]?.kind ?? "unknown";
      // Plain words, inserted exactly as typed: Enter after a fully typed `note right` must stay a line break.
      const words = (list: string[]): CompletionEntry[] =>
        list.map((word, i) => ({ label: word, category: "keyword" as const, insertText: word, sortText: rank(1, i) }));
      switch (context.after) {
        case "note":
          return words(NOTE_WORDS[kind] ?? NOTE_DEFAULT);
        case "note-side":
          return words(["of"]);
        case "hide":
          return words(HIDE_WORDS[kind] ?? ["empty members", "stereotype", "@unlinked"]);
        case "class-declaration":
          return [
            ...words(["extends", "implements", "as"]),
            { label: "<<stereotype>>", category: "keyword", insertText: "<<${1:stereotype}>>", snippet: true, sortText: rank(2, 0) },
          ];
        case "gantt-task":
          return GANTT_VERBS.map((verb, i) => ({
            label: verb.label,
            category: "keyword" as const,
            insertText: verb.body,
            snippet: true,
            detail: verb.description,
            documentation: docMarkdown(verb.label.split(" ")[0], "gantt"),
            sortText: rank(1, i),
          }));
        case "nwdiag-attribute":
          return NWDIAG_ATTRIBUTES.map((body, i) => ({
            label: body.split(" ")[0],
            category: "keyword" as const,
            insertText: body,
            snippet: true,
            sortText: rank(1, i),
          }));
      }
      return [];
    }
    case "skinparam-name": {
      const prefix = context.prefix.join("").toLowerCase();
      const preferred = SKINPARAM_PREFIXES[analysis.blocks[analysis.lineInfo[line]?.block]?.kind ?? "unknown"] ?? [];
      const out: CompletionEntry[] = [];
      vocab.skinparams.forEach((name, i) => {
        if (prefix && name.toLowerCase().startsWith(prefix) && name.length > prefix.length) {
          const relative = name.slice(prefix.length);
          out.push({ label: relative, category: "skinparam", insertText: relative, detail: name, docTerm: name, sortText: rank(1, i) });
        }
        const group = preferred.some((p) => name.startsWith(p)) ? 2 : 3;
        out.push({ label: name, category: "skinparam", insertText: name, docTerm: name, sortText: rank(group, i) });
      });
      return out;
    }
    case "value": {
      const choices = valueChoices(context.name);
      if (choices === "color") return colorEntries(1);
      return (choices ?? []).map((value, i) => ({ label: value, category: "value" as const, insertText: value, sortText: rank(1, i) }));
    }
    case "color":
      return colorEntries(1);
    case "directive":
      return vocab.preprocessor.map((name, i) => ({
        label: `!${name}`,
        category: "directive" as const,
        insertText: DIRECTIVE_SNIPPETS[name] ?? `!${name}`,
        snippet: DIRECTIVE_SNIPPETS[name] !== undefined || undefined,
        documentation: docMarkdown(`!${name}`),
        sortText: rank(1, i),
      }));
    case "theme":
      return vocab.themes.map((name, i) => ({ label: name, category: "theme" as const, insertText: name, detail: "theme", sortText: rank(1, i) }));
    case "include":
      return stdlibIncludePaths().map((path, i) => ({
        label: path,
        category: "include" as const,
        insertText: after === ">" ? path : `${path}>`,
        detail: "standard library",
        sortText: rank(1, i),
      }));
    case "pragma":
      return PRAGMAS.map((pragma, i) => ({ label: pragma.name, category: "value" as const, insertText: pragma.name, detail: pragma.description, sortText: rank(1, i) }));
    case "builtin":
      return BUILTIN_FUNCTIONS.map((fn, i) => {
        const required = fn.params.filter((p) => !p.endsWith("?") && !p.startsWith("..."));
        const args = required.map((p, index) => `\${${index + 1}:${p}}`).join(", ");
        return {
          label: fn.name,
          category: "builtin" as const,
          insertText: `${fn.name}(${args})`,
          snippet: true,
          detail: builtinSignature(fn),
          documentation: docMarkdown(fn.name) ?? fn.summary,
          sortText: rank(1, i),
        };
      });
    case "preprocessor":
      return preprocessorEntries(analysis, line, 1, (s) =>
        context.sprite ? s.category === "sprite" : s.name.startsWith("$") && s.category !== "sprite",
      ).map((entry) => (context.sprite && after !== ">" ? { ...entry, insertText: `${entry.insertText}>` } : entry));
    case "icon":
      return vocab.icons.map((name, i) => ({
        label: name,
        category: "icon" as const,
        insertText: after === ">" ? name : `${name}>`,
        detail: "OpenIconic icon",
        sortText: rank(1, i),
      }));
    case "emoji":
      return vocab.emojis.map((name, i) => ({
        label: name,
        category: "emoji" as const,
        insertText: after === ":" ? name : `${name}:>`,
        detail: "emoji",
        sortText: rank(1, i),
      }));
    case "stereotype": {
      const blockIndex = analysis.lineInfo[line]?.block ?? -1;
      const kind = analysis.blocks[blockIndex]?.kind;
      const names = [...new Set([...analysis.stereotypes, ...(kind === "state" ? STATE_STEREOTYPES : [])])];
      return names.map((name, i) => ({
        label: name,
        category: "stereotype" as const,
        insertText: after === ">" ? name : `${name}>>`,
        detail: analysis.stereotypes.includes(name) ? "stereotype used in this document" : "state stereotype",
        sortText: rank(1, i),
      }));
    }
    case "creole":
      return CREOLE_TAGS.map((tag, i) => ({
        label: tag.label,
        category: "creole" as const,
        insertText: tag.snippet,
        snippet: true,
        detail: tag.description,
        filterText: tag.label,
        sortText: rank(1, i),
      }));
    case "style": {
      const selectors = STYLE_SELECTORS.map((name, i): CompletionEntry => ({
        label: name,
        category: "style",
        insertText: `${name} {\n\t$0\n}`,
        snippet: true,
        detail: name.endsWith("Diagram") ? "diagram selector" : "selector",
        documentation: docMarkdown(name),
        sortText: rank(name.endsWith("Diagram") === (context.depth === 0) ? 2 : 3, i),
      }));
      if (context.depth === 0) return selectors;
      const properties = STYLE_PROPERTIES.map((name, i): CompletionEntry => ({
        label: name,
        category: "style",
        insertText: `${name} `,
        detail: "style property",
        documentation: docMarkdown(name),
        sortText: rank(1, i),
        retrigger: valueChoices(name) !== undefined || undefined,
      }));
      return [...properties, ...selectors];
    }
  }
}

/** Whether a popup here, opened by typing `trigger`, would interrupt ordinary typing. */
function isQuiet(context: CompletionContext, trigger: string | undefined, before: string): boolean {
  if (trigger === undefined) return false;
  switch (trigger) {
    case " ":
      // Indentation, and positions where the next word is the user's own text.
      return (
        before.trim() === "" ||
        context.kind === "top" ||
        context.kind === "tag" ||
        context.kind === "creole" ||
        (context.kind === "continuation" && context.after === "class-declaration")
      );
    case "<":
      return context.kind !== "creole" && context.kind !== "stereotype" && context.kind !== "include";
    case "[":
    case "(":
    case "{":
    case "|":
      return context.kind !== "name" && !(context.kind === "continuation" && context.after === "nwdiag-attribute");
    case "#":
      return context.kind !== "color";
    case "&":
      return context.kind !== "icon";
    case ":":
      return context.kind !== "emoji";
    default:
      return false;
  }
}

/** Completion items for a cursor position (0-based line and column). */
export function complete(analysis: Analysis, line: number, column: number, options: CompletionOptions = {}): CompletionList {
  const context = completionContext(analysis, line, column);
  const start = "start" in context ? context.start : column;
  const before = (analysis.lines[line] ?? "").slice(0, column);
  const quiet = isQuiet(context, options.trigger, before);
  return { context, start, end: column, items: quiet ? [] : entriesFor(analysis, context, line, column) };
}

/** Documentation for an item that deferred it via `docTerm`. */
export function resolveDocumentation(entry: CompletionEntry, kind?: DiagramKind): string | undefined {
  return entry.documentation ?? (entry.docTerm ? docMarkdown(entry.docTerm, kind) : undefined);
}
