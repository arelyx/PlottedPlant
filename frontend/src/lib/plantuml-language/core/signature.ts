import type { Analysis } from "./analysis";
import { builtinFunction } from "./facts";
import { docMarkdown } from "./render";
import { stdlibMacro } from "./stdlib";

export interface SignatureResult {
  /** Full signature text; each parameter's label is a substring range of it. */
  label: string;
  parameters: { label: [number, number]; documentation?: string }[];
  activeParameter: number;
  documentation?: string;
}

interface OpenCall {
  name: string;
  /** Number of top-level commas between the opening parenthesis and the cursor. */
  argumentIndex: number;
}

/** The innermost call whose argument list contains the cursor. */
function openCallAt(text: string, column: number): OpenCall | undefined {
  let depth = 0;
  let commas = 0;
  let quote = false;
  for (let i = 0; i < column; i++) if (text[i] === '"') quote = !quote;
  if (quote) {
    // Inside a string argument: walk back to its opening quote first.
    let i = column - 1;
    while (i >= 0 && text[i] !== '"') i--;
    column = i;
  }
  for (let i = column - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '"') {
      i--;
      while (i >= 0 && text[i] !== '"') i--;
    } else if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const name = /([%$]?[A-Za-z_]\w*)$/.exec(text.slice(0, i));
      return name ? { name: name[1], argumentIndex: commas } : undefined;
    } else if (ch === "," && depth === 0) commas++;
  }
  return undefined;
}

function build(name: string, params: string[], argumentIndex: number, documentation?: string): SignatureResult {
  let label = `${name}(`;
  const parameters: SignatureResult["parameters"] = [];
  params.forEach((param, i) => {
    if (i > 0) label += ", ";
    parameters.push({ label: [label.length, label.length + param.length] });
    label += param;
  });
  label += ")";
  const variadic = params.length > 0 && params[params.length - 1].startsWith("...");
  const activeParameter = variadic ? Math.min(argumentIndex, params.length - 1) : argumentIndex;
  return { label, parameters, activeParameter, documentation };
}

/** Signature help for a call to a `%builtin`, a user procedure/function/macro, or a stdlib macro. */
export function signatureHelp(analysis: Analysis, line: number, column: number): SignatureResult | undefined {
  const info = analysis.lineInfo[line];
  const text = analysis.lines[line];
  if (!info || text === undefined || info.mode === "comment" || info.mode === "outside") return undefined;
  // Typing the parameter list of a definition is not a call.
  if (/^\s*!(?:unquoted\s+|final\s+)*(?:procedure|function|definelong|define)\b/i.test(text)) return undefined;
  const call = openCallAt(text, column);
  if (!call) return undefined;

  if (call.name.startsWith("%")) {
    const fn = builtinFunction(call.name);
    return fn ? build(fn.name, fn.params, call.argumentIndex, docMarkdown(fn.name) ?? fn.summary) : undefined;
  }
  const symbol = analysis.symbols.find(
    (s) => s.block === -1 && s.name === call.name && s.parameters !== undefined && (s.category === "function" || s.category === "macro"),
  );
  if (symbol?.parameters) {
    const params = symbol.parameters.map((p) => (p.defaultValue !== undefined ? `${p.name} = ${p.defaultValue}` : p.name));
    return build(symbol.name, params, call.argumentIndex, `${symbol.keyword}, defined on line ${symbol.declaration.line + 1}`);
  }
  const macro = stdlibMacro(call.name, analysis.includes);
  if (macro) {
    return build(
      macro.name,
      macro.params.map((p) => (p.optional ? `${p.name}?` : p.name)),
      call.argumentIndex,
      `Macro from the \`${macro.library}\` standard library`,
    );
  }
  return undefined;
}
