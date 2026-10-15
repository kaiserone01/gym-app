import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import type { VitrinaItem } from "../entities/Vitrina";
import {
  construirSecuencia,
  estaVencido,
  estaVisible,
  estadoVisibilidad,
  numeroDeDiapositiva,
  repartirFranjas,
  type Diapositiva,
} from "./secuenciaVitrina";

const AHORA = new Date("2026-10-15T16:00:00Z");
const ent = (id: string, orden: number, extra: Partial<VitrinaItem> = {}) =>
  itemDePrueba({ id, orden, tipo: "ENTRENADOR", nombre: id, ...extra });
const promo = (id: string, orden: number, extra: Partial<VitrinaItem> = {}) =>
  itemDePrueba({ id, orden, tipo: "PROMO", ...extra });
const claves = (secuencia: Diapositiva[]) =>
  secuencia.map((d) => (d.tipo === "FRANJA" ? d.entrenadores.map((e) => e.id).join("+") : d.item.id));

describe("repartirFranjas", () => {
  test.each([
    [0, []],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [10, [3, 3, 2, 2]],
  ])("%i entrenadores → %j", (n, esperado) => {
    expect(repartirFranjas(n)).toEqual(esperado);
  });

  test("nunca deja una franja de 1 si hay más de un entrenador", () => {
    for (let n = 2; n <= 30; n++) expect(Math.min(...repartirFranjas(n))).toBeGreaterThanOrEqual(2);
  });
});

describe("visibilidad", () => {
  test("un ítem inactivo no se ve", () => {
    expect(estaVisible(promo("a", 1, { activo: false }), AHORA)).toBe(false);
  });
  test("un ítem futuro no se ve todavía", () => {
    expect(estaVisible(promo("a", 1, { inicio: new Date("2026-10-16T04:00:00Z") }), AHORA)).toBe(false);
  });
  test("un ítem vencido no se ve", () => {
    const vencido = promo("a", 1, { fin: new Date("2026-10-15T15:59:59.999Z") });
    expect(estaVencido(vencido, AHORA)).toBe(true);
    expect(estaVisible(vencido, AHORA)).toBe(false);
  });
  test("con fin en el mismo instante todavía se ve", () => {
    expect(estaVisible(promo("a", 1, { fin: AHORA }), AHORA)).toBe(true);
  });
  test("estadoVisibilidad distingue los cuatro casos", () => {
    expect(estadoVisibilidad(promo("a", 1, { activo: false }), AHORA)).toBe("INACTIVO");
    expect(estadoVisibilidad(promo("a", 1, { fin: new Date("2026-10-01T00:00:00Z") }), AHORA)).toBe("VENCIDO");
    expect(estadoVisibilidad(promo("a", 1, { inicio: new Date("2026-11-01T00:00:00Z") }), AHORA)).toBe("PROGRAMADO");
    expect(estadoVisibilidad(promo("a", 1), AHORA)).toBe("EN_PANTALLA");
  });
});

describe("construirSecuencia", () => {
  test("sin ítems visibles devuelve una lista vacía", () => {
    expect(construirSecuencia([promo("a", 1, { activo: false })], AHORA, 12)).toEqual([]);
    expect(construirSecuencia([], AHORA, 12)).toEqual([]);
  });

  test("ordena por orden aunque lleguen desordenados", () => {
    const s = construirSecuencia([promo("c", 3), promo("a", 1), promo("b", 2)], AHORA, 12);
    expect(claves(s)).toEqual(["a", "b", "c"]);
  });

  test("5 entrenadores consecutivos se reparten 3+2", () => {
    const items = [1, 2, 3, 4, 5].map((n) => ent(`e${n}`, n));
    expect(claves(construirSecuencia(items, AHORA, 12))).toEqual(["e1+e2+e3", "e4+e5"]);
  });

  test("7 entrenadores se reparten 3+2+2", () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ent(`e${n}`, n));
    expect(claves(construirSecuencia(items, AHORA, 12))).toEqual(["e1+e2+e3", "e4+e5", "e6+e7"]);
  });

  test("una promo entre dos entrenadores corta el grupo", () => {
    const s = construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12);
    expect(claves(s)).toEqual(["a", "p", "b"]);
  });

  test("un entrenador inactivo entre dos activos no corta el grupo", () => {
    const s = construirSecuencia([ent("a", 1), ent("x", 2, { activo: false }), ent("b", 3)], AHORA, 12);
    expect(claves(s)).toEqual(["a+b"]);
  });

  test("la duración de un cartel es la suya o la de la sede", () => {
    const s = construirSecuencia([promo("a", 1, { duracionSeg: 20 }), promo("b", 2)], AHORA, 12);
    expect(s.map((d) => d.duracionSeg)).toEqual([20, 12]);
  });

  test("la duración de una franja es la de su primer entrenador, o la de la sede", () => {
    expect(construirSecuencia([ent("a", 1, { duracionSeg: 30 }), ent("b", 2)], AHORA, 12)[0].duracionSeg).toBe(30);
    expect(construirSecuencia([ent("a", 1), ent("b", 2, { duracionSeg: 30 })], AHORA, 12)[0].duracionSeg).toBe(12);
  });

  test("la clave de cada diapositiva es estable y única", () => {
    const s = construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12);
    expect(new Set(s.map((d) => d.clave)).size).toBe(3);
    expect(construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12).map((d) => d.clave)).toEqual(
      s.map((d) => d.clave)
    );
  });
});

describe("numeroDeDiapositiva", () => {
  test("numera cada ítem visible, los entrenadores de una franja comparten número", () => {
    const s = construirSecuencia([ent("a", 1), ent("b", 2), promo("p", 3)], AHORA, 12);
    const numeros = numeroDeDiapositiva(s);
    expect(numeros.get("a")).toBe(1);
    expect(numeros.get("b")).toBe(1);
    expect(numeros.get("p")).toBe(2);
  });
});
