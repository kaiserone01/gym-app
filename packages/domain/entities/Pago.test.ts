import { describe, expect, test } from "vitest";
import { validarLineasDePago, repartirLineasPago, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError, MontoNoCubreDeudaError } from "./Pago";
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

describe("repartirLineasPago", () => {
  test("una línea: la primera parte toma el monto pedido y el resto queda para la segunda", () => {
    const [primeras, segundas] = repartirLineasPago([linea({ monto: 35.25 })], 5.25);
    expect(primeras.map((l) => l.monto)).toEqual([5.25]);
    expect(segundas.map((l) => l.monto)).toEqual([30]);
  });

  test("varias líneas: consume en orden y parte la línea del límite conservando método, operación y tasa", () => {
    const lineas = [
      linea({ monto: 3, metodo: "Efectivo (USD)" }),
      linea({ monto: 20, metodo: "Pago Móvil - Banesco", numeroOperacion: "1234", tasaCambio: 50 }),
    ];
    const [primeras, segundas] = repartirLineasPago(lineas, 5.25);

    expect(primeras.map((l) => [l.metodo, l.monto])).toEqual([
      ["Efectivo (USD)", 3],
      ["Pago Móvil - Banesco", 2.25],
    ]);
    expect(segundas).toEqual([{ ...lineas[1], monto: 17.75 }]);
    expect(primeras[1]).toMatchObject({ numeroOperacion: "1234", tasaCambio: 50 });
  });

  test("si el monto pedido coincide con el borde de una línea no deja líneas vacías", () => {
    const [primeras, segundas] = repartirLineasPago([linea({ monto: 5 }), linea({ monto: 10 })], 5);
    expect(primeras.map((l) => l.monto)).toEqual([5]);
    expect(segundas.map((l) => l.monto)).toEqual([10]);
  });

  test("no acumula error de punto flotante (0.1 + 0.2 repartido en 0.3)", () => {
    const [primeras, segundas] = repartirLineasPago([linea({ monto: 0.1 }), linea({ monto: 0.2 }), linea({ monto: 1 })], 0.3);
    expect(primeras.map((l) => l.monto)).toEqual([0.1, 0.2]);
    expect(segundas.map((l) => l.monto)).toEqual([1]);
  });

  test("rechaza si las líneas no alcanzan para cubrir el monto pedido", () => {
    expect(() => repartirLineasPago([linea({ monto: 5 })], 5.25)).toThrow(MontoNoCubreDeudaError);
  });
});
