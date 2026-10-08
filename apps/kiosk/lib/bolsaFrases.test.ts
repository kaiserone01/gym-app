import { describe, expect, it } from "vitest";
import { crearBolsa } from "./bolsaFrases";

const ITEMS = ["a", "b", "c", "d", "e"];

describe("crearBolsa", () => {
  it("entrega todos los elementos sin repetir antes de agotar la bolsa", () => {
    const siguiente = crearBolsa(ITEMS);
    const ronda = ITEMS.map(() => siguiente());
    expect([...ronda].sort()).toEqual(ITEMS);
  });

  it("vuelve a barajar y en la segunda ronda también salen todos", () => {
    const siguiente = crearBolsa(ITEMS);
    ITEMS.forEach(() => siguiente());
    const ronda2 = ITEMS.map(() => siguiente());
    expect([...ronda2].sort()).toEqual(ITEMS);
  });

  it("la primera de una ronda nueva no repite la última de la anterior", () => {
    // Con 2 elementos cada barajada consume un número: 0 → [b, a]; 0,99 → [a, b].
    const valores = [0, 0.99];
    let i = 0;
    const siguiente = crearBolsa(["a", "b"], () => valores[i++]);
    expect([siguiente(), siguiente()]).toEqual(["b", "a"]);
    // La ronda 2 saldría [a, b] (empezaría con "a", la última de la ronda 1): se intercambia.
    expect(siguiente()).toBe("b");
  });

  it("con un solo elemento lo repite sin romperse", () => {
    const siguiente = crearBolsa(["x"]);
    expect([siguiente(), siguiente(), siguiente()]).toEqual(["x", "x", "x"]);
  });
});
