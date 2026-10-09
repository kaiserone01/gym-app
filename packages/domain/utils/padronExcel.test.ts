import { describe, expect, test } from "vitest";
import { CAMPOS_EDITABLES_PADRON, COLUMNAS_EXCEL, PALETA_RESALTADO, esColorResaltadoValido, fechaDesdeTextoPadron, normalizarCamposPadron, resolverPlanPadron } from "./padronExcel";

describe("resolverPlanPadron", () => {
  test("precio de un plan real → nombre y precio", () => {
    expect(resolverPlanPadron(30)).toEqual({ planNombre: "Mensual con entrenador", precioPlanUSD: 30 });
    expect(resolverPlanPadron("8")).toEqual({ planNombre: "Semanal", precioPlanUSD: 8 });
    expect(resolverPlanPadron(0)).toEqual({ planNombre: "Cortesia", precioPlanUSD: 0 });
  });
  test("variantes con asterisco o 25+5", () => {
    expect(resolverPlanPadron("20*")).toEqual({ planNombre: "Plan Viejo", precioPlanUSD: 20 });
    expect(resolverPlanPadron(" 20* ")).toEqual({ planNombre: "Plan Viejo", precioPlanUSD: 20 });
    expect(resolverPlanPadron("25+5")).toEqual({ planNombre: "Mensual con entrenador", precioPlanUSD: 30 });
  });
  test("precio legacy sin plan real: conserva el precio, sin nombre", () => {
    expect(resolverPlanPadron(15)).toEqual({ planNombre: null, precioPlanUSD: 15 });
    expect(resolverPlanPadron("15*")).toEqual({ planNombre: null, precioPlanUSD: 15 });
  });
  test("texto o vacío: sin plan ni precio", () => {
    expect(resolverPlanPadron("Pend")).toEqual({ planNombre: null, precioPlanUSD: null });
    expect(resolverPlanPadron("")).toEqual({ planNombre: null, precioPlanUSD: null });
    expect(resolverPlanPadron(null)).toEqual({ planNombre: null, precioPlanUSD: null });
  });
});

describe("fechaDesdeTextoPadron", () => {
  test("acepta aaaa-mm-dd y dd-mm-aaaa", () => {
    expect(fechaDesdeTextoPadron("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(fechaDesdeTextoPadron("01-10-2026")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(fechaDesdeTextoPadron(" 2026-10-01 ")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  test("vacío, null, texto, malformada o inexistente → null", () => {
    for (const valor of [null, "", "  ", "mañana", "19-082026", "17-06-026", "2026-02-30", "31-02-2026"]) {
      expect(fechaDesdeTextoPadron(valor)).toBeNull();
    }
  });
});

describe("normalizarCamposPadron", () => {
  test("calcula fechas y plan a partir de los crudos", () => {
    const n = normalizarCamposPadron({
      nombre: "Ana", status: "ACTIVO", fNacimiento: "1990-05-02", celular: null,
      fVenc: "2026-10-01", fechaPago: "efectivo", plan: "25", colI: null, colJ: null, colK: null,
    });
    expect(n.fechaVencimiento?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(n.fechaNacimiento?.toISOString()).toBe("1990-05-02T00:00:00.000Z");
    expect(n.fechaUltimoPago).toBeNull(); // nota de texto, no fecha
    expect(n.planNombre).toBe("Mensual sin entrenador");
    expect(n.precioPlanUSD).toBe(25);
  });
});

describe("columnas editables y resaltado", () => {
  test("incluye colI, colJ y colK y las 11 columnas del Excel", () => {
    expect(CAMPOS_EDITABLES_PADRON).toEqual(expect.arrayContaining(["colI", "colJ", "colK"]));
    expect(COLUMNAS_EXCEL).toHaveLength(11);
  });
  test("esColorResaltadoValido acepta solo los hex de la paleta en mayúsculas", () => {
    for (const { hex } of PALETA_RESALTADO) expect(esColorResaltadoValido(hex)).toBe(true);
    for (const hex of ["ffff00", "#FFFF00", "000000", "", "FFFF0"]) expect(esColorResaltadoValido(hex)).toBe(false);
  });
});
