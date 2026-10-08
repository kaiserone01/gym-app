import { describe, expect, it } from "vitest";
import { limitarOpacidad, normalizarFrasesReposo, MAX_FRASES_REPOSO, MAX_LARGO_FRASE_REPOSO } from "./reposoKiosko";

describe("normalizarFrasesReposo", () => {
  it("recorta espacios y descarta vacías", () => {
    expect(normalizarFrasesReposo(["  HOLA  ", "", "   ", "ADIÓS"])).toEqual(["HOLA", "ADIÓS"]);
  });

  it("descarta duplicadas conservando la primera", () => {
    expect(normalizarFrasesReposo(["A", "B", "A"])).toEqual(["A", "B"]);
  });

  it("corta cada frase al máximo de caracteres", () => {
    const larga = "X".repeat(MAX_LARGO_FRASE_REPOSO + 10);
    expect(normalizarFrasesReposo([larga])[0]).toHaveLength(MAX_LARGO_FRASE_REPOSO);
  });

  it("limita la cantidad de frases", () => {
    const muchas = Array.from({ length: MAX_FRASES_REPOSO + 5 }, (_, i) => `F${i}`);
    expect(normalizarFrasesReposo(muchas)).toHaveLength(MAX_FRASES_REPOSO);
  });

  it("devuelve lista vacía si no hay nada útil", () => {
    expect(normalizarFrasesReposo(["", "  "])).toEqual([]);
  });
});

describe("limitarOpacidad", () => {
  it("acepta valores dentro del rango", () => {
    expect(limitarOpacidad(60)).toBe(60);
    expect(limitarOpacidad("45")).toBe(45);
  });

  it("sube al mínimo y baja al máximo", () => {
    expect(limitarOpacidad(5)).toBe(20);
    expect(limitarOpacidad(250)).toBe(100);
  });

  it("redondea decimales", () => {
    expect(limitarOpacidad(60.6)).toBe(61);
  });

  it("devuelve 100 si el valor no es un número", () => {
    expect(limitarOpacidad("abc")).toBe(100);
    expect(limitarOpacidad(undefined)).toBe(100);
    expect(limitarOpacidad(null)).toBe(100);
    expect(limitarOpacidad("")).toBe(100);
  });
});
