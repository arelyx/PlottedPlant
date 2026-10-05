import type * as Monaco from "monaco-editor";
import { documentColors, type ColorToken } from "../core/colors";
import {
  computeDiagnostics,
  ENGINE_OVERLAP_CODES,
  type Diagnostic,
  type DiagnosticCode,
} from "../core/diagnostics";
import { contentColumns, describeEngineError } from "../core/engine-error";
import { foldingRanges } from "../core/folding";
import { closerIndentEdit, formatEdits, type TextEdit } from "../core/format";
import { analyzeStructure, type DocumentStructure } from "../core/structure";
import type { Range } from "../core/types";

const LANGUAGE_ID = "plantuml";
/** Marker owner for lint diagnostics; the render path's engine error uses "plantuml". */
export const LINT_OWNER = "plantuml-lint";
const ENGINE_OWNER = "plantuml";
/** Long enough that a construct being typed is usually closed before the lint runs. */
const LINT_DELAY_MS = 500;

/**
 * Characters that can complete a closing or branching keyword (`end`, `endif`,
 * `else`, `end note`, `fork again`, `}`, `case (x)`, `</style>`…). The
 * provider itself checks that the line really is one.
 */
const CLOSER_TRIGGER_CHARACTERS = ["}", "]", ")", ">", "d", "f", "e", "k", "t", "h", "x", "n", "p", "r", "g", "b"];

interface Analysis {
  version: number;
  lines: string[];
  structure: DocumentStructure;
}

const analyses = new WeakMap<Monaco.editor.ITextModel, Analysis>();

/** Structure analysis of a model, computed once per model version. */
function analyze(model: Monaco.editor.ITextModel): Analysis {
  const cached = analyses.get(model);
  const version = model.getVersionId();
  if (cached && cached.version === version) return cached;
  const lines = model.getLinesContent();
  const analysis = { version, lines, structure: analyzeStructure(lines) };
  analyses.set(model, analysis);
  return analysis;
}

function toMonacoRange(range: Range): Monaco.IRange {
  return {
    startLineNumber: range.startLine + 1,
    startColumn: range.startColumn + 1,
    endLineNumber: range.endLine + 1,
    endColumn: range.endColumn + 1,
  };
}

function toMonacoEdits(edits: readonly TextEdit[]): Monaco.languages.TextEdit[] {
  return edits.map((edit) => ({ range: toMonacoRange(edit.range), text: edit.text }));
}

interface LintState {
  version: number;
  cursorLine: number | undefined;
  diagnostics: Diagnostic[];
  timer: ReturnType<typeof setTimeout> | undefined;
  listener: Monaco.IDisposable;
}

function registerLint(monaco: typeof Monaco): { flush: (model: Monaco.editor.ITextModel) => void } {
  const states = new Map<Monaco.editor.ITextModel, LintState>();
  const severities: Record<Diagnostic["severity"], Monaco.MarkerSeverity> = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
    hint: monaco.MarkerSeverity.Hint,
  };

  /** Line of the local cursor in the editor showing this model, if it has focus. */
  const cursorLine = (model: Monaco.editor.ITextModel): number | undefined => {
    const editor = monaco.editor.getEditors().find((candidate) => candidate.getModel() === model && candidate.hasTextFocus());
    const position = editor?.getPosition();
    return position ? position.lineNumber - 1 : undefined;
  };

  const publish = (model: Monaco.editor.ITextModel) => {
    const state = states.get(model);
    if (!state || model.isDisposed()) return;
    clearTimeout(state.timer);
    state.timer = undefined;
    const { lines, structure, version } = analyze(model);
    state.version = version;
    state.cursorLine = cursorLine(model);
    state.diagnostics = computeDiagnostics(lines, { structure, cursorLine: state.cursorLine });
    monaco.editor.setModelMarkers(
      model,
      LINT_OWNER,
      state.diagnostics.map((diagnostic) => ({
        ...toMonacoRange(diagnostic.range),
        severity: severities[diagnostic.severity],
        message: diagnostic.message,
        code: diagnostic.code,
        source: "PlantUML",
        tags: diagnostic.unnecessary ? [monaco.MarkerTag.Unnecessary] : undefined,
      })),
    );

    // An engine error on a line the lint now explains would say the same thing twice.
    const explained = explainedLines(state.diagnostics);
    const engine = monaco.editor.getModelMarkers({ owner: ENGINE_OWNER, resource: model.uri });
    if (engine.some((marker) => explained.has(marker.startLineNumber - 1))) {
      monaco.editor.setModelMarkers(
        model,
        ENGINE_OWNER,
        engine.filter((marker) => !explained.has(marker.startLineNumber - 1)),
      );
    }
  };

  const schedule = (model: Monaco.editor.ITextModel) => {
    const state = states.get(model);
    if (!state) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => publish(model), LINT_DELAY_MS);
  };

  const attach = (model: Monaco.editor.ITextModel) => {
    if (states.has(model) || model.getLanguageId() !== LANGUAGE_ID) return;
    states.set(model, {
      version: -1,
      cursorLine: undefined,
      diagnostics: [],
      timer: undefined,
      listener: model.onDidChangeContent(() => schedule(model)),
    });
    schedule(model);
  };

  const detach = (model: Monaco.editor.ITextModel) => {
    const state = states.get(model);
    if (!state) return;
    clearTimeout(state.timer);
    state.listener.dispose();
    states.delete(model);
    if (!model.isDisposed()) monaco.editor.setModelMarkers(model, LINT_OWNER, []);
  };

  monaco.editor.getModels().forEach(attach);
  monaco.editor.onDidCreateModel(attach);
  monaco.editor.onWillDisposeModel(detach);
  monaco.editor.onDidChangeModelLanguage(({ model }) => {
    detach(model);
    attach(model);
  });

  // The construct around the cursor is shown more quietly, so moving to another line can change severities.
  monaco.editor.onDidCreateEditor((editor) => {
    editor.onDidChangeCursorPosition((event) => {
      const model = editor.getModel();
      const state = model ? states.get(model) : undefined;
      if (!model || !state || state.timer !== undefined) return;
      if (event.position.lineNumber - 1 === state.cursorLine) return;
      if (state.diagnostics.some((diagnostic) => diagnostic.code === "unclosed-block")) schedule(model);
    });
  });

  monaco.languages.registerCodeActionProvider(LANGUAGE_ID, {
    provideCodeActions(model, _range, context) {
      const state = states.get(model);
      if (!state || state.version !== model.getVersionId()) return { actions: [], dispose() {} };
      const actions: Monaco.languages.CodeAction[] = [];
      for (const marker of context.markers) {
        const diagnostic = state.diagnostics.find(
          (candidate) =>
            candidate.code === marker.code &&
            candidate.range.startLine + 1 === marker.startLineNumber &&
            candidate.range.startColumn + 1 === marker.startColumn,
        );
        if (!diagnostic) continue;
        diagnostic.fixes.forEach((fix, index) => {
          actions.push({
            title: fix.title,
            kind: "quickfix",
            diagnostics: [marker],
            isPreferred: index === 0,
            edit: {
              edits: fix.edits.map((edit) => ({
                resource: model.uri,
                versionId: model.getVersionId(),
                textEdit: { range: toMonacoRange(edit.range), text: edit.text },
              })),
            },
          });
        });
      }
      return { actions, dispose() {} };
    },
  }, { providedCodeActionKinds: ["quickfix"] });

  return {
    flush(model) {
      const state = states.get(model);
      if (state && (state.timer !== undefined || state.version !== model.getVersionId())) publish(model);
    },
  };
}

/** Lines carrying a lint diagnostic that already says what the engine would say there. */
function explainedLines(diagnostics: readonly Diagnostic[]): Set<number> {
  const lines = new Set<number>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "hint" && ENGINE_OVERLAP_CODES.has(diagnostic.code)) lines.add(diagnostic.range.startLine);
  }
  return lines;
}

let flushLint: ((model: Monaco.editor.ITextModel) => void) | undefined;

/**
 * Marker for an error reported by the rendering engine, for
 * `setModelMarkers(model, "plantuml", …)`: the 1-based `line` is clamped to
 * the document, the range covers the text of the line rather than its whole
 * width, and the message is made readable. Returns no marker when a lint
 * diagnostic on the same line already explains the problem.
 */
export function engineErrorMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  error: { message: string; line?: number },
): Monaco.editor.IMarkerData[] {
  const lineNumber = Math.min(Math.max(error.line ?? 1, 1), model.getLineCount());
  flushLint?.(model);
  const lint = monaco.editor.getModelMarkers({ owner: LINT_OWNER, resource: model.uri });
  const explained = lint.some(
    (marker) =>
      marker.startLineNumber === lineNumber &&
      marker.severity !== monaco.MarkerSeverity.Hint &&
      typeof marker.code === "string" &&
      ENGINE_OVERLAP_CODES.has(marker.code as DiagnosticCode),
  );
  if (explained) return [];
  const { start, end } = contentColumns(model.getLineContent(lineNumber));
  return [
    {
      severity: monaco.MarkerSeverity.Error,
      message: describeEngineError(error.message),
      source: "PlantUML",
      startLineNumber: lineNumber,
      startColumn: start + 1,
      endLineNumber: lineNumber,
      endColumn: Math.max(end, start + 1) + 1,
    },
  ];
}

function colorInformation(token: ColorToken): Monaco.languages.IColorInformation | undefined {
  if (token.hex === null) return undefined;
  const channel = (offset: number) => parseInt(token.hex!.slice(offset, offset + 2), 16) / 255;
  return {
    range: toMonacoRange({ startLine: token.line, startColumn: token.start, endLine: token.line, endColumn: token.end }),
    color: { red: channel(1), green: channel(3), blue: channel(5), alpha: token.alpha },
  };
}

/** Folding, formatting, lint diagnostics with quick fixes, and colour decorators. */
export function registerAuthoring(monaco: typeof Monaco): void {
  monaco.languages.registerFoldingRangeProvider(LANGUAGE_ID, {
    provideFoldingRanges(model) {
      const { lines, structure } = analyze(model);
      return foldingRanges(lines, structure).map((range) => ({
        start: range.startLine + 1,
        end: range.endLine + 1,
        kind:
          range.kind === "comment"
            ? monaco.languages.FoldingRangeKind.Comment
            : range.kind === "region"
              ? monaco.languages.FoldingRangeKind.Region
              : undefined,
      }));
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
    displayName: "PlantUML",
    provideDocumentFormattingEdits(model, options) {
      const { lines, structure } = analyze(model);
      return toMonacoEdits(formatEdits(lines, options, undefined, structure));
    },
  });

  // Monaco binds Format Document to Ctrl+Shift+I on Linux, which browsers take for their dev tools.
  monaco.editor.addKeybindingRule({
    keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
    command: "editor.action.formatDocument",
    when: `editorTextFocus && !editorReadonly && editorLangId == ${LANGUAGE_ID}`,
  });

  monaco.languages.registerDocumentRangeFormattingEditProvider(LANGUAGE_ID, {
    displayName: "PlantUML",
    provideDocumentRangeFormattingEdits(model, range, options) {
      const { lines, structure } = analyze(model);
      // A selection ending at column 1 does not include that line.
      const endLine = range.endColumn === 1 && range.endLineNumber > range.startLineNumber ? range.endLineNumber - 2 : range.endLineNumber - 1;
      return toMonacoEdits(formatEdits(lines, options, { startLine: range.startLineNumber - 1, endLine }, structure));
    },
  });

  monaco.languages.registerOnTypeFormattingEditProvider(LANGUAGE_ID, {
    autoFormatTriggerCharacters: CLOSER_TRIGGER_CHARACTERS,
    provideOnTypeFormattingEdits(model, position) {
      // Only when the keyword has just been completed: the cursor is at the end of the line's text.
      if (position.column <= model.getLineContent(position.lineNumber).trimEnd().length) return [];
      const { lines, structure } = analyze(model);
      const edit = closerIndentEdit(lines, position.lineNumber - 1, structure);
      return edit ? toMonacoEdits([edit]) : [];
    },
  });

  monaco.languages.registerColorProvider(LANGUAGE_ID, {
    provideDocumentColors(model) {
      const { lines, structure } = analyze(model);
      return documentColors(lines, structure).flatMap((token) => colorInformation(token) ?? []);
    },
    provideColorPresentations(model, info) {
      const byte = (value: number) => Math.round(value * 255).toString(16).padStart(2, "0").toUpperCase();
      const { red, green, blue, alpha } = info.color;
      const label = `#${byte(red)}${byte(green)}${byte(blue)}${alpha < 1 ? byte(alpha) : ""}`;
      // After `line:`, a gradient separator or `##`, PlantUML wants the digits without the `#`.
      const { lines, structure } = analyze(model);
      const token = documentColors(lines, structure).find(
        (candidate) =>
          candidate.line === info.range.startLineNumber - 1 && candidate.start === info.range.startColumn - 1,
      );
      return [{ label, textEdit: { range: info.range, text: token?.bare ? label.slice(1) : label } }];
    },
  });

  flushLint = registerLint(monaco).flush;
}
