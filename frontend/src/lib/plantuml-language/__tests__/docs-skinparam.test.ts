import { describe, expect, it } from "vitest";
import { generatedSkinparamDocs, skinparamDocs } from "../core/docs-skinparam";
import { normalizeTerm } from "../core/docs-model";
import { vocab } from "../vocab";

describe("skinparam documentation", () => {
  const documented = new Set([...skinparamDocs, ...generatedSkinparamDocs()].flatMap((r) => r.terms.map(normalizeTerm)));

  it("covers every skinparam in PlantUML's list", () => {
    // "Style" is answered by the `style` keyword entry; its skinparam meaning is indexed as "skinparam style".
    const missing = vocab.skinparams.filter((name) => !documented.has(normalizeTerm(name)));
    expect(missing).toEqual(["Style"]);
    expect(documented.has("skinparam style")).toBe(true);
  });

  it("derives element, property and value from a regular name", () => {
    const doc = generatedSkinparamDocs().find((r) => r.terms[0] === "ClassBorderColor");
    expect(doc?.signature).toBe("skinparam ClassBorderColor <color>");
    expect(doc?.body).toContain("outline colour of classes");
    expect(doc?.body).toContain("class { LineColor");
    expect(doc?.example).toBe("skinparam ClassBorderColor DarkSlateGray\nclass Account");
  });

  it("describes stereotype settings as such", () => {
    const doc = generatedSkinparamDocs().find((r) => r.terms[0] === "ParticipantStereotypeFontSize");
    expect(doc?.body).toContain("`<<stereotype>>` label on sequence participants");
    expect(doc?.example).toContain("<<service>>");
  });

  it("keeps hand-written entries out of the generated set", () => {
    const generatedTerms = generatedSkinparamDocs().map((r) => normalizeTerm(r.terms[0]));
    expect(generatedTerms).not.toContain("backgroundcolor");
    expect(generatedTerms).not.toContain("linetype");
    expect(new Set(generatedTerms).size).toBe(generatedTerms.length);
  });
});
