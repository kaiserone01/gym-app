import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import type { DatosVitrinaItem } from "../entities/Vitrina";
import { numeroOpcional, validarVitrinaItem } from "./vitrinaItem";

function datos(parcial: Partial<DatosVitrinaItem> = {}): DatosVitrinaItem {
  const { id: _id, sucursalId: _s, orden: _o, activo: _a, ...resto } = itemDePrueba();
  return { ...resto, ...parcial };
}

describe("numeroOpcional", () => {
  test("vacío, nulo o indefinido → null", () => {
    expect(numeroOpcional("")).toBeNull();
    expect(numeroOpcional("  ")).toBeNull();
    expect(numeroOpcional(null)).toBeNull();
    expect(numeroOpcional(undefined)).toBeNull();
  });
  test("acepta coma decimal", () => {
    expect(numeroOpcional("12,5")).toBe(12.5);
    expect(numeroOpcional("7")).toBe(7);
  });
  test("texto no numérico → NaN (lo rechaza la validación)", () => {
    expect(Number.isNaN(numeroOpcional("abc"))).toBe(true);
  });
});

describe("validarVitrinaItem", () => {
  test("un cartel válido pasa", () => {
    expect(validarVitrinaItem(datos({ precioUSD: 20, ofertaUSD: 15, descuentoPct: 25 }))).toBeNull();
  });
  test("exige el medio", () => {
    expect(validarVitrinaItem(datos({ mediaUrl: "  " }))).toMatch(/imagen o el video/);
  });
  test("el entrenador exige nombre", () => {
    expect(validarVitrinaItem(datos({ tipo: "ENTRENADOR", nombre: "  " }))).toMatch(/nombre/);
    expect(validarVitrinaItem(datos({ tipo: "ENTRENADOR", nombre: "Ana" }))).toBeNull();
  });
  test("oferta mayor que el precio", () => {
    expect(validarVitrinaItem(datos({ precioUSD: 10, ofertaUSD: 15 }))).toMatch(/mayor/);
  });
  test("montos no numéricos o negativos", () => {
    expect(validarVitrinaItem(datos({ precioUSD: Number.NaN }))).toMatch(/precio/i);
    expect(validarVitrinaItem(datos({ ofertaUSD: -1 }))).toMatch(/oferta/i);
  });
  test("descuento fuera de rango", () => {
    expect(validarVitrinaItem(datos({ descuentoPct: 150 }))).toMatch(/0 y 100/);
    expect(validarVitrinaItem(datos({ descuentoPct: Number.NaN }))).toMatch(/0 y 100/);
  });
  test("duración fuera de rango o no entera", () => {
    expect(validarVitrinaItem(datos({ duracionSeg: 2 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 301 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 7.5 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: Number.NaN }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 10 }))).toBeNull();
  });
  test("fechas invertidas", () => {
    const error = validarVitrinaItem(datos({ inicio: new Date("2026-10-20T00:00:00Z"), fin: new Date("2026-10-10T00:00:00Z") }));
    expect(error).toMatch(/fin/);
  });
  test("textos demasiado largos", () => {
    expect(validarVitrinaItem(datos({ etiqueta: "x".repeat(21) }))).toMatch(/20/);
    expect(validarVitrinaItem(datos({ frase: "x".repeat(121) }))).toMatch(/120/);
  });
});
