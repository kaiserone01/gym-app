// packages/db/migracion-excel/config.test.ts
import { describe, expect, test } from "vitest";
import { generarTemplateMapeoPlan, generarTemplateReglasCedula } from "./config";
import type { FilaNormalizada } from "./tipos";

function fila(overrides: Partial<FilaNormalizada>): FilaNormalizada {
  return {
    numeroFila: 1,
    nombre: "X",
    estado: "ACTIVA",
    cedulaOriginal: "1",
    celularOriginal: null,
    plan: { tipo: "dominante", valorUSD: 20 },
    fVenc: { tipo: "valida", fecha: new Date() },
    fechaPago: { tipo: "vacia" },
    ...overrides,
  };
}

describe("generarTemplateMapeoPlan", () => {
  test("incluye cada valorOriginal requiereMapeo distinto, una sola vez, en pendiente", () => {
    const filas = [
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } }),
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } }), // repetido
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "Pend" } }),
      fila({ plan: { tipo: "dominante", valorUSD: 20 } }), // no debe aparecer
    ];
    const template = generarTemplateMapeoPlan(filas);
    expect(template).toHaveLength(2);
    expect(template.every((e) => e.accion === "pendiente")).toBe(true);
    expect(template.map((e) => e.valorExcel).sort()).toEqual(["Pend", "TV"]);
  });
});

describe("generarTemplateReglasCedula", () => {
  test("detecta pares con la misma cedulaOriginal y sugiere una filaGanadora", () => {
    const filas = [
      fila({ numeroFila: 10, cedulaOriginal: "999", nombre: "Vanessa Yajuris" }),
      fila({ numeroFila: 20, cedulaOriginal: "999", nombre: "Vannesa Yajunis" }),
      fila({ numeroFila: 30, cedulaOriginal: "888", nombre: "Otra Persona" }), // única, no es par
    ];
    const reglas = generarTemplateReglasCedula(filas);
    expect(reglas.vaciaAccion).toBe("placeholder");
    expect(reglas.duplicados).toHaveLength(1);
    expect(reglas.duplicados[0].cedula).toBe("999");
    expect([reglas.duplicados[0].filaA, reglas.duplicados[0].filaB].sort()).toEqual([10, 20]);
    expect([10, 20]).toContain(reglas.duplicados[0].filaGanadora);
  });
});
