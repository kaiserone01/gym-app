// packages/db/migracion-excel/normalizarFila.test.ts
import { describe, expect, test } from "vitest";
import { normalizarStatus, clasificarValorPlan, parsearFechaExcel, normalizarFila } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

describe("normalizarStatus", () => {
  test("ACTIVO sin espacios → ACTIVA", () => {
    expect(normalizarStatus("ACTIVO")).toBe("ACTIVA");
  });
  test(" ACTIVO con espacio inicial → ACTIVA", () => {
    expect(normalizarStatus(" ACTIVO")).toBe("ACTIVA");
  });
  test(" ACTIVA variante femenina → ACTIVA", () => {
    expect(normalizarStatus(" ACTIVA")).toBe("ACTIVA");
  });
  test("S/V sin espacio → VENCIDA", () => {
    expect(normalizarStatus("S/V")).toBe("VENCIDA");
  });
  test(" S/V con espacio inicial → VENCIDA", () => {
    expect(normalizarStatus(" S/V")).toBe("VENCIDA");
  });
  test("vacío → null", () => {
    expect(normalizarStatus("")).toBe(null);
  });
  test("solo espacio → null", () => {
    expect(normalizarStatus(" ")).toBe(null);
  });
});

describe("clasificarValorPlan", () => {
  test("20 limpio → dominante valorUSD 20", () => {
    expect(clasificarValorPlan("20")).toEqual({ tipo: "dominante", valorUSD: 20 });
  });
  test("8 limpio → dominante valorUSD 8", () => {
    expect(clasificarValorPlan(8)).toEqual({ tipo: "dominante", valorUSD: 8 });
  });
  test("15 (no dominante) → requiereMapeo", () => {
    expect(clasificarValorPlan("15")).toEqual({ tipo: "requiereMapeo", valorOriginal: "15" });
  });
  test("20* con asterisco → requiereMapeo, nunca tratado como 20 limpio", () => {
    expect(clasificarValorPlan("20*")).toEqual({ tipo: "requiereMapeo", valorOriginal: "20*" });
  });
  test(" 20* con espacio y asterisco → requiereMapeo con valor trimmeado", () => {
    expect(clasificarValorPlan(" 20*")).toEqual({ tipo: "requiereMapeo", valorOriginal: "20*" });
  });
  test("Pend (texto) → requiereMapeo", () => {
    expect(clasificarValorPlan("Pend")).toEqual({ tipo: "requiereMapeo", valorOriginal: "Pend" });
  });
  test("blanco/null → requiereMapeo con valorOriginal vacío", () => {
    expect(clasificarValorPlan(null)).toEqual({ tipo: "requiereMapeo", valorOriginal: "" });
  });
  test("0 → requiereMapeo (no es uno de los 5 dominantes)", () => {
    expect(clasificarValorPlan(0)).toEqual({ tipo: "requiereMapeo", valorOriginal: "0" });
  });
});

describe("parsearFechaExcel", () => {
  test("serial de Excel (45658 = 2025-01-01) → fecha válida", () => {
    const resultado = parsearFechaExcel(45658);
    expect(resultado.tipo).toBe("valida");
    if (resultado.tipo === "valida") {
      expect(resultado.fecha.getUTCFullYear()).toBe(2025);
      expect(resultado.fecha.getUTCMonth()).toBe(0);
      expect(resultado.fecha.getUTCDate()).toBe(1);
    }
  });
  test("texto dd-mm-yyyy → fecha válida", () => {
    const resultado = parsearFechaExcel("24-07-2023");
    expect(resultado.tipo).toBe("valida");
    if (resultado.tipo === "valida") {
      expect(resultado.fecha.getUTCFullYear()).toBe(2023);
      expect(resultado.fecha.getUTCMonth()).toBe(6);
      expect(resultado.fecha.getUTCDate()).toBe(24);
    }
  });
  test("malformada 19-082026 (falta separador) → invalida malformada", () => {
    const resultado = parsearFechaExcel("19-082026");
    expect(resultado).toEqual({ tipo: "invalida", motivo: "malformada", valorOriginal: "19-082026" });
  });
  test("malformada 17-06-026 (falta dígito de año) → invalida malformada", () => {
    const resultado = parsearFechaExcel("17-06-026");
    expect(resultado).toEqual({ tipo: "invalida", motivo: "malformada", valorOriginal: "17-06-026" });
  });
  test("vacía/null → invalida vacia", () => {
    expect(parsearFechaExcel(null)).toEqual({ tipo: "invalida", motivo: "vacia", valorOriginal: null });
  });
  test("vacía string → invalida vacia", () => {
    expect(parsearFechaExcel("")).toEqual({ tipo: "invalida", motivo: "vacia", valorOriginal: "" });
  });
});

describe("normalizarFila — cedula", () => {
  function filaBase(overrides: Partial<FilaExcelCruda>): FilaExcelCruda {
    return {
      numeroFila: 100,
      nombre: "Alguien",
      status: "ACTIVO",
      fNacimiento: null,
      celular: null,
      cedula: "12345678",
      fVenc: 45658,
      fechaPago: null,
      plan: "20",
      ...overrides,
    };
  }

  test("celular presente (formato teléfono) → celularOriginal con el valor tal cual", () => {
    const resultado = normalizarFila(filaBase({ celular: "0412-1234567" }));
    expect(resultado.celularOriginal).toBe("0412-1234567");
  });

  test("celular presente con texto no-teléfono (ESPAÑA) → celularOriginal preservado tal cual", () => {
    const resultado = normalizarFila(filaBase({ celular: "ESPAÑA" }));
    expect(resultado.celularOriginal).toBe("ESPAÑA");
  });

  test("celular vacío (null) → celularOriginal null", () => {
    const resultado = normalizarFila(filaBase({ celular: null }));
    expect(resultado.celularOriginal).toBe(null);
  });

  test("celular vacío (string vacío) → celularOriginal null", () => {
    const resultado = normalizarFila(filaBase({ celular: "" }));
    expect(resultado.celularOriginal).toBe(null);
  });

  test("cedula numérica presente → cedulaOriginal con el valor tal cual (string)", () => {
    const resultado = normalizarFila(filaBase({ cedula: 12345678 }));
    expect(resultado.cedulaOriginal).toBe("12345678");
  });

  test("cedula vacía (null) → cedulaOriginal null", () => {
    const resultado = normalizarFila(filaBase({ cedula: null }));
    expect(resultado.cedulaOriginal).toBe(null);
  });

  test("cedula vacía (string vacío) → cedulaOriginal null", () => {
    const resultado = normalizarFila(filaBase({ cedula: "" }));
    expect(resultado.cedulaOriginal).toBe(null);
  });

  test("cedula no-numérica pero presente (E-3880506) → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "E-3880506" }));
    expect(resultado.cedulaOriginal).toBe("E-3880506");
  });

  test("cedula S/C (texto presente) → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "S/C" }));
    expect(resultado.cedulaOriginal).toBe("S/C");
  });

  test("cedula de un solo carácter G → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "G" }));
    expect(resultado.cedulaOriginal).toBe("G");
  });
});
