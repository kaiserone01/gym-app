import { describe, expect, test } from "vitest";
import { MapaIds } from "./mapaIds";

describe("MapaIds", () => {
  test("set/get devuelve el id nuevo y cuenta el tamaño", () => {
    const mapa = new MapaIds("planes");
    mapa.set("viejo-1", "nuevo-1");
    mapa.set("viejo-2", "nuevo-2");
    expect(mapa.get("viejo-1")).toBe("nuevo-1");
    expect(mapa.tamano).toBe(2);
  });

  test("get de un id faltante lanza con la etiqueta y el id", () => {
    const mapa = new MapaIds("productos");
    expect(() => mapa.get("abc")).toThrow(/productos.*abc/);
  });

  test("getONull deja pasar null/undefined y remapea los presentes", () => {
    const mapa = new MapaIds("usuarios");
    mapa.set("u1", "n1");
    expect(mapa.getONull(null)).toBeNull();
    expect(mapa.getONull(undefined)).toBeNull();
    expect(mapa.getONull("u1")).toBe("n1");
  });

  test("getONull de un id no nulo faltante lanza", () => {
    const mapa = new MapaIds("usuarios");
    expect(() => mapa.getONull("u9")).toThrow(/usuarios.*u9/);
  });

  test("set dos veces del mismo id viejo lanza (duplicado)", () => {
    const mapa = new MapaIds("miembros");
    mapa.set("m1", "n1");
    expect(() => mapa.set("m1", "n2")).toThrow(/miembros.*m1/);
  });
});
