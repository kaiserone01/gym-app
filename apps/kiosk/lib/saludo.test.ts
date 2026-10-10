import { describe, expect, it } from "vitest";
import { FRASE_BIENVENIDA_NEUTRA, FRASE_CUMPLEANOS } from "./frases";
import { textoSaludo } from "./saludo";

describe("textoSaludo", () => {
  it("por defecto saluda con la bienvenida neutra, igual para todos", () => {
    expect(textoSaludo(false)).toBe("¡BIENVENID@, ADRENALINER!");
    expect(textoSaludo(false)).toBe(FRASE_BIENVENIDA_NEUTRA);
  });

  it("sin dato de cumpleaños (un API viejo que no lo envía) usa la bienvenida neutra", () => {
    expect(textoSaludo(undefined)).toBe(FRASE_BIENVENIDA_NEUTRA);
  });

  it("el cumpleaños manda sobre el saludo", () => {
    expect(textoSaludo(true)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo(true)).toBe(FRASE_CUMPLEANOS);
  });

  it("la @ solo existe en la bienvenida neutra", () => {
    expect(FRASE_BIENVENIDA_NEUTRA).toContain("@");
    expect(FRASE_CUMPLEANOS).not.toContain("@");
  });
});
