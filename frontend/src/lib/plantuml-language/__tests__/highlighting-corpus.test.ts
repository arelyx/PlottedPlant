import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { lightPalette, tokenStyles } from "../monaco/themes";
import { tokenize, tokenizeLine } from "./highlighting-harness";

// Every corpus file is accepted by a real PlantUML server (see
// scripts/plantuml-check.mjs), so nothing in it may be highlighted as an
// error, and the tokenizer must finish each file back in its root state.

const corpusDir = path.join(__dirname, "corpus");
const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith(".puml"));
const read = (file: string) => fs.readFileSync(path.join(corpusDir, file), "utf8");

const themed = Object.keys(tokenStyles(lightPalette));
/** A token class is themed if a theme rule names it or one of its dotted prefixes. */
const isThemed = (type: string) => themed.some((rule) => type === rule || type.startsWith(`${rule}.`));

describe("corpus highlighting", () => {
  it("has a sample for every diagram family", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)("%s", (file) => {
    const lines = tokenize(read(file));
    const types = new Set<string>();
    for (const [i, l] of lines.entries()) {
      for (const tok of l.tokens) {
        expect(tok.type, `${file}:${i + 1} "${tok.text}"`).not.toMatch(/invalid|error|illegal/);
        if (tok.text.trim()) types.add(tok.type);
      }
    }
    expect(lines.at(-1)?.stack, "state after the last line").toEqual(["root"]);
    for (const type of types) expect(isThemed(type), `no theme rule for "${type}"`).toBe(true);
    // Not a wall of undifferentiated identifiers (ASCII-art bodies are opaque by design).
    const opaque = /^@start(?:ditaa|jcckit)\b/m.test(read(file));
    if (lines.length > 6 && !opaque) expect(types.size, [...types].join(", ")).toBeGreaterThanOrEqual(3);
  });

  it("never throws while a file is being typed top-down", () => {
    // Replays every prefix of every line from the state the preceding lines
    // left behind: Monarch throws if a rule matches without making progress.
    for (const file of files) {
      let state = tokenizeLine("").endState;
      for (const text of read(file).split(/\r?\n/)) {
        for (let end = 1; end < text.length; end++) {
          expect(() => tokenizeLine(text.slice(0, end), state), `${file}: ${text.slice(0, end)}`).not.toThrow();
        }
        state = tokenizeLine(text, state).endState;
      }
    }
  });
});
