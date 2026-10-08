import { describe, expect, it } from "vitest";
import { FRASE_BIENVENIDA, FRASE_BIENVENIDA_NEUTRA, FRASE_BIENVENIDO, FRASE_CUMPLEANOS } from "./frases";
import { textoSaludo } from "./saludo";

describe("textoSaludo", () => {
  it("sin género (miembros ya existentes o un API viejo que no lo envía) usa la bienvenida neutra", () => {
    expect(textoSaludo(null, false)).toBe("¡BIENVENID@, ADRENALINER!");
    expect(textoSaludo(undefined, undefined)).toBe("¡BIENVENID@, ADRENALINER!");
    expect(textoSaludo(null, false)).toBe(FRASE_BIENVENIDA_NEUTRA);
  });

  it("con género conocido saluda Bienvenido o Bienvenida", () => {
    expect(textoSaludo("MASCULINO", false)).toBe("¡BIENVENIDO, ADRENALINER!");
    expect(textoSaludo("FEMENINO", false)).toBe("¡BIENVENIDA, ADRENALINER!");
    expect(textoSaludo("MASCULINO", undefined)).toBe(FRASE_BIENVENIDO);
    expect(textoSaludo("FEMENINO", undefined)).toBe(FRASE_BIENVENIDA);
  });

  it("el cumpleaños manda sobre el saludo y es igual para todos", () => {
    expect(textoSaludo("MASCULINO", true)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo("FEMENINO", true)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo(null, true)).toBe(FRASE_CUMPLEANOS);
    expect(textoSaludo(undefined, true)).toBe(FRASE_CUMPLEANOS);
  });

  it("la @ solo existe en la bienvenida neutra", () => {
    expect(FRASE_BIENVENIDA_NEUTRA).toContain("@");
    expect([FRASE_BIENVENIDO, FRASE_BIENVENIDA, FRASE_CUMPLEANOS].some((frase) => frase.includes("@"))).toBe(false);
  });
});
