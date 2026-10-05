import type * as Monaco from "monaco-editor";
import { analyze, type Analysis } from "../core/analysis";
import { complete, resolveDocumentation, type CompletionCategory, type CompletionEntry } from "../core/completion";
import { hover } from "../core/hover";
import {
  definition,
  documentSymbols,
  highlights,
  prepareRename,
  references,
  rename,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  semanticTokens,
  type OutlineKind,
  type OutlineNode,
} from "../core/navigation";
import { signatureHelp } from "../core/signature";
import type { Range } from "../core/types";

const LANGUAGE = "plantuml";

/** One analysis per model version, shared by every provider. */
const cache = new WeakMap<Monaco.editor.ITextModel, { version: number; analysis: Analysis }>();

export function analysisFor(model: Monaco.editor.ITextModel): Analysis {
  const version = model.getVersionId();
  const hit = cache.get(model);
  if (hit && hit.version === version) return hit.analysis;
  const analysis = analyze(model.getValue());
  cache.set(model, { version, analysis });
  return analysis;
}

function toRange(range: Range): Monaco.IRange {
  return {
    startLineNumber: range.startLine + 1,
    startColumn: range.startColumn + 1,
    endLineNumber: range.endLine + 1,
    endColumn: range.endColumn + 1,
  };
}

function completionKind(monaco: typeof Monaco, category: CompletionCategory): Monaco.languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind;
  switch (category) {
    case "keyword":
    case "directive":
      return kinds.Keyword;
    case "snippet":
    case "creole":
      return kinds.Snippet;
    case "symbol":
      return kinds.Variable;
    case "arrow":
      return kinds.Operator;
    case "skinparam":
    case "style":
      return kinds.Property;
    case "color":
      return kinds.Color;
    case "theme":
    case "value":
      return kinds.Value;
    case "include":
      return kinds.File;
    case "builtin":
    case "function":
      return kinds.Function;
    case "variable":
      return kinds.Variable;
    case "icon":
    case "emoji":
      return kinds.Constant;
    case "stereotype":
      return kinds.TypeParameter;
    case "tag":
      return kinds.Module;
  }
}

function symbolKind(monaco: typeof Monaco, kind: OutlineKind): Monaco.languages.SymbolKind {
  const kinds = monaco.languages.SymbolKind;
  switch (kind) {
    case "block":
      return kinds.Module;
    case "class":
      return kinds.Class;
    case "interface":
      return kinds.Interface;
    case "enum":
      return kinds.Enum;
    case "element":
      return kinds.Object;
    case "container":
      return kinds.Package;
    case "member":
      return kinds.Field;
    case "method":
      return kinds.Method;
    case "enumMember":
      return kinds.EnumMember;
    case "variable":
      return kinds.Variable;
    case "function":
      return kinds.Function;
    case "structure":
      return kinds.Namespace;
    case "node":
      return kinds.String;
  }
}

function toDocumentSymbol(monaco: typeof Monaco, node: OutlineNode): Monaco.languages.DocumentSymbol {
  return {
    name: node.name,
    detail: node.detail,
    kind: symbolKind(monaco, node.kind),
    tags: [],
    range: toRange(node.range),
    selectionRange: toRange(node.selectionRange),
    children: node.children.map((child) => toDocumentSymbol(monaco, child)),
  };
}

/** Completion, hover, navigation, rename, outline, semantic tokens and signature help. */
export function registerIntelligence(monaco: typeof Monaco): void {
  const entries = new WeakMap<Monaco.languages.CompletionItem, CompletionEntry>();

  monaco.languages.registerCompletionItemProvider(LANGUAGE, {
    triggerCharacters: ["!", "@", "#", "<", "$", "%", " ", "&", ":", "[", "(", "{", "|"],
    provideCompletionItems(model, position, context) {
      const analysis = analysisFor(model);
      const line = position.lineNumber - 1;
      const list = complete(analysis, line, position.column - 1, { trigger: context.triggerCharacter });
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: list.start + 1,
        endLineNumber: position.lineNumber,
        endColumn: list.end + 1,
      };
      const suggestions = list.items.map((entry) => {
        const item: Monaco.languages.CompletionItem = {
          label: entry.label,
          kind: completionKind(monaco, entry.category),
          insertText: entry.insertText,
          insertTextRules: entry.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          detail: entry.detail,
          // A colour item shows its swatch when the documentation is the bare hex string.
          documentation: entry.color ?? (entry.documentation ? { value: entry.documentation } : undefined),
          sortText: entry.sortText,
          filterText: entry.filterText,
          range,
          command: entry.retrigger ? { id: "editor.action.triggerSuggest", title: "Suggest" } : undefined,
        };
        if (entry.docTerm) entries.set(item, entry);
        return item;
      });
      return { suggestions };
    },
    resolveCompletionItem(item) {
      const entry = entries.get(item);
      if (entry && !item.documentation) {
        const documentation = resolveDocumentation(entry);
        if (documentation) item.documentation = { value: documentation };
      }
      return item;
    },
  });

  monaco.languages.registerHoverProvider(LANGUAGE, {
    provideHover(model, position) {
      const result = hover(analysisFor(model), position.lineNumber - 1, position.column - 1);
      if (!result) return null;
      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: result.startColumn + 1,
          endLineNumber: position.lineNumber,
          endColumn: result.endColumn + 1,
        },
        contents: result.contents.map((value) => ({ value, supportHtml: result.html === true })),
      };
    },
  });

  monaco.languages.registerDefinitionProvider(LANGUAGE, {
    provideDefinition(model, position) {
      const range = definition(analysisFor(model), position.lineNumber - 1, position.column - 1);
      return range ? { uri: model.uri, range: toRange(range) } : null;
    },
  });

  monaco.languages.registerReferenceProvider(LANGUAGE, {
    provideReferences(model, position, context) {
      return references(analysisFor(model), position.lineNumber - 1, position.column - 1, context.includeDeclaration).map((range) => ({
        uri: model.uri,
        range: toRange(range),
      }));
    },
  });

  monaco.languages.registerDocumentHighlightProvider(LANGUAGE, {
    provideDocumentHighlights(model, position) {
      return highlights(analysisFor(model), position.lineNumber - 1, position.column - 1).map((highlight) => ({
        range: toRange(highlight.range),
        kind:
          highlight.kind === "write"
            ? monaco.languages.DocumentHighlightKind.Write
            : monaco.languages.DocumentHighlightKind.Read,
      }));
    },
  });

  monaco.languages.registerRenameProvider(LANGUAGE, {
    resolveRenameLocation(model, position) {
      const target = prepareRename(analysisFor(model), position.lineNumber - 1, position.column - 1);
      if (!target.ok) return { range: monaco.Range.fromPositions(position), text: "", rejectReason: target.reason };
      return { range: toRange(target.range), text: target.placeholder };
    },
    provideRenameEdits(model, position, newName) {
      const result = rename(analysisFor(model), position.lineNumber - 1, position.column - 1, newName);
      if (!result.ok) return { edits: [], rejectReason: result.reason };
      const versionId = model.getVersionId();
      return {
        edits: result.edits.map((edit) => ({
          resource: model.uri,
          textEdit: { range: toRange(edit.range), text: edit.newText },
          versionId,
        })),
      };
    },
  });

  monaco.languages.registerDocumentSymbolProvider(LANGUAGE, {
    displayName: "PlantUML",
    provideDocumentSymbols(model) {
      return documentSymbols(analysisFor(model)).map((node) => toDocumentSymbol(monaco, node));
    },
  });

  const tokenTypes: string[] = [...SEMANTIC_TOKEN_TYPES];
  monaco.languages.registerDocumentSemanticTokensProvider(LANGUAGE, {
    getLegend: () => ({ tokenTypes, tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS] }),
    provideDocumentSemanticTokens(model) {
      const tokens = semanticTokens(analysisFor(model));
      const data = new Uint32Array(tokens.length * 5);
      let previousLine = 0;
      let previousStart = 0;
      tokens.forEach((token, i) => {
        const deltaLine = token.line - previousLine;
        data[i * 5] = deltaLine;
        data[i * 5 + 1] = deltaLine === 0 ? token.startColumn - previousStart : token.startColumn;
        data[i * 5 + 2] = token.length;
        data[i * 5 + 3] = tokenTypes.indexOf(token.type);
        data[i * 5 + 4] = token.declaration ? 1 : 0;
        previousLine = token.line;
        previousStart = token.startColumn;
      });
      return { data };
    },
    releaseDocumentSemanticTokens() {},
  });

  monaco.languages.registerSignatureHelpProvider(LANGUAGE, {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [")"],
    provideSignatureHelp(model, position) {
      const result = signatureHelp(analysisFor(model), position.lineNumber - 1, position.column - 1);
      if (!result) return null;
      return {
        value: {
          signatures: [
            {
              label: result.label,
              documentation: result.documentation ? { value: result.documentation } : undefined,
              parameters: result.parameters.map((p) => ({ label: p.label })),
            },
          ],
          activeSignature: 0,
          activeParameter: result.activeParameter,
        },
        dispose() {},
      };
    },
  });
}
