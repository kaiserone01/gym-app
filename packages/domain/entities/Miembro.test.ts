import { describe, expect, test } from "vitest";
import { GENEROS, parsearGenero } from "./Miembro";

describe("parsearGenero", () => {
  test("acepta los dos valores válidos", () => {
    for (const genero of GENEROS) expect(parsearGenero(genero)).toBe(genero);
  });

  test("cualquier otra cosa es null (vacío, desconocido, minúsculas, no texto)", () => {
    expect(parsearGenero("")).toBeNull();
    expect(parsearGenero("NEUTRO")).toBeNull();
    expect(parsearGenero("masculino")).toBeNull();
    expect(parsearGenero(null)).toBeNull();
    expect(parsearGenero(undefined)).toBeNull();
    expect(parsearGenero(5)).toBeNull();
  });
});
