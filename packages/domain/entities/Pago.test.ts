import { describe, expect, test } from "vitest";
import { validarLineasDePago, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError } from "./Pago";
import type { DatosLineaPago } from "./Pago";

function linea(datos: Partial<DatosLineaPago>): DatosLineaPago {
  return {
    monto: 10,
    metodo: "efectivo_usd",
    metodoPagoId: "metodo-1",
    numeroOperacion: null,
    tasaCambio: null,
    ...datos,
  };
}

describe("validarLineasDePago — modo conAbono (RegistrarPago)", () => {
  test("acepta una sola línea con monto positivo y método", () => {
    expect(() => validarLineasDePago([linea({ monto: 25 })], "conAbono")).not.toThrow();
  });

  test("acepta abono parcial: suma menor al precio del plan no es error en este modo", () => {
    expect(() => validarLineasDePago([linea({ monto: 5 })], "conAbono")).not.toThrow();
  });

  test("rechaza un array vacío", () => {
    expect(() => validarLineasDePago([], "conAbono")).toThrow(LineasDePagoInvalidasError);
  });

  test("rechaza una línea con monto <= 0 y método (no es el caso especial de cortesía)", () => {
    expect(() => validarLineasDePago([linea({ monto: 0, metodo: "" })], "conAbono")).not.toThrow();
  });

  test("rechaza una línea sin método cuando el monto es positivo", () => {
    expect(() => validarLineasDePago([linea({ monto: 10, metodo: "" })], "conAbono")).toThrow(
      LineasDePagoInvalidasError
    );
  });

  test("rechaza líneas combinadas si alguna tiene monto <= 0", () => {
    expect(() =>
      validarLineasDePago([linea({ monto: 10 }), linea({ monto: 0 })], "conAbono")
    ).toThrow(LineasDePagoInvalidasError);
  });
});

describe("validarLineasDePago — modo exacto (CambiarPlanConPago)", () => {
  test("acepta una sola línea cuya suma cubre exactamente el objetivo", () => {
    expect(() => validarLineasDePago([linea({ monto: 21.67 })], "exacto", 21.67)).not.toThrow();
  });

  test("acepta líneas combinadas cuya suma cubre exactamente el objetivo", () => {
    expect(() =>
      validarLineasDePago([linea({ monto: 10 }), linea({ monto: 11.67 })], "exacto", 21.67)
    ).not.toThrow();
  });

  test("rechaza cuando la suma de las líneas no alcanza el objetivo", () => {
    expect(() => validarLineasDePago([linea({ monto: 15 })], "exacto", 21.67)).toThrow(
      MontoLineasNoCubreObjetivoError
    );
  });

  test("rechaza cuando la suma de las líneas excede el objetivo", () => {
    expect(() => validarLineasDePago([linea({ monto: 30 })], "exacto", 21.67)).toThrow(
      MontoLineasNoCubreObjetivoError
    );
  });

  test("rechaza un array vacío", () => {
    expect(() => validarLineasDePago([], "exacto", 21.67)).toThrow(LineasDePagoInvalidasError);
  });

  test("rechaza una línea sin método o con monto <= 0", () => {
    expect(() => validarLineasDePago([linea({ monto: 0, metodo: "" })], "exacto", 21.67)).toThrow();
  });
});
