import { describe, expect, it } from "vitest";
import { FRASES_REPOSO } from "./frases";
import { claveDeFrases, frasesDesdeClave } from "./frasesReposo";

describe("frasesReposo", () => {
  it("sin frases configuradas usa las predeterminadas", () => {
    expect(frasesDesdeClave(claveDeFrases(undefined))).toBe(FRASES_REPOSO);
    expect(frasesDesdeClave(claveDeFrases([]))).toBe(FRASES_REPOSO);
  });

  it("con frases configuradas las devuelve en el mismo orden", () => {
    expect(frasesDesdeClave(claveDeFrases(["UNA", "DOS"]))).toEqual(["UNA", "DOS"]);
  });

  it("la misma lista da la misma clave aunque sea otro arreglo", () => {
    expect(claveDeFrases(["A", "B"])).toBe(claveDeFrases(["A", "B"]));
    expect(claveDeFrases(["A", "B"])).not.toBe(claveDeFrases(["B", "A"]));
  });
});
