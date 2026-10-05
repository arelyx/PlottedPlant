import { describe, expect, it } from "vitest";
import { darkPalette, lightPalette, plottedPlantDark, plottedPlantLight, tokenStyles, type Palette } from "../monaco/themes";
import { plantumlMonarchLanguage } from "../monaco/tokenizer";
import { T } from "../monaco/tokenizer-tokens";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every token name a grammar action can emit, found by walking the rule tree. */
function emittedTokens(): Set<string> {
  const found = new Set<string>();
  const visit = (action: unknown): void => {
    if (typeof action === "string") {
      if (action && !action.startsWith("@")) found.add(action);
    } else if (Array.isArray(action)) {
      action.forEach(visit);
    } else if (action && typeof action === "object") {
      const a = action as { token?: unknown; cases?: Record<string, unknown> };
      if (a.token !== undefined) visit(a.token);
      if (a.cases) Object.values(a.cases).forEach(visit);
    }
  };
  for (const rules of Object.values(plantumlMonarchLanguage.tokenizer)) {
    for (const rule of rules) if (Array.isArray(rule)) visit(rule[1]);
  }
  return found;
}

const themes: [string, Palette][] = [
  ["light", lightPalette],
  ["dark", darkPalette],
];

describe("themes", () => {
  it.each(themes)("%s: every token colour meets WCAG AA (4.5:1) on the editor background", (_name, palette) => {
    for (const [token, style] of Object.entries(tokenStyles(palette))) {
      const ratio = contrast(style.color, palette.background);
      expect(ratio, `${token || "(default)"} ${style.color} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(themes)("%s: text stays readable on the current-line and selection backgrounds", (_name, palette) => {
    for (const style of Object.values(tokenStyles(palette))) {
      expect(contrast(style.color, palette.lineHighlight)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(style.color, palette.selection)).toBeGreaterThanOrEqual(3);
    }
  });

  it("styles every token class the grammar can emit, and nothing it cannot", () => {
    const styled = Object.keys(tokenStyles(lightPalette));
    const emitted = emittedTokens();
    for (const token of emitted) {
      expect(styled.some((rule) => token === rule || token.startsWith(`${rule}.`)), `no style for ${token}`).toBe(true);
    }
    for (const token of Object.values(T)) expect(emitted.has(token), `${token} is never emitted`).toBe(true);
    for (const token of emitted) expect(token).not.toMatch(/invalid|error|illegal/);
  });

  it("styles the semantic token types the language service reports", () => {
    for (const data of [plottedPlantLight, plottedPlantDark]) {
      const rules = new Set(data.rules.map((r) => r.token));
      for (const type of ["class", "variable", "function", "parameter", "type", "namespace", "macro", "enumMember", "property"]) {
        expect(rules.has(type), type).toBe(true);
      }
    }
  });

  it("keeps the roles distinguishable within a theme", () => {
    for (const [, p] of themes) {
      const roles = [p.statement, p.type, p.control, p.meta, p.variable, p.arrow, p.text, p.value, p.comment];
      expect(new Set(roles).size).toBe(roles.length);
    }
  });

  it("inherits from the matching Monaco base theme", () => {
    expect(plottedPlantLight.base).toBe("vs");
    expect(plottedPlantDark.base).toBe("vs-dark");
  });
});
