import { describe, expect, it } from "vitest";
import { posicionarIndice } from "./posicionarDiapositiva";

const sec = (...claves: string[]) => claves.map((clave) => ({ clave }));

describe("posicionarIndice", () => {
  it("sigue la diapositiva por su clave aunque cambie de posición", () => {
    expect(posicionarIndice(1, "b", sec("x", "a", "b"))).toBe(2);
  });
  it("si desapareció, conserva la posición acotada", () => {
    expect(posicionarIndice(2, "c", sec("a", "b"))).toBe(1);
    expect(posicionarIndice(1, "b", sec("a", "z", "w"))).toBe(1);
  });
  it("secuencia vacía o sin clave previa nunca sale de rango", () => {
    expect(posicionarIndice(5, "a", [])).toBe(0);
    expect(posicionarIndice(9, null, sec("a", "b"))).toBe(1);
  });
});
