import { describe, expect, it } from "vitest";
import { PRIMERA_FILA_DATOS, resolverSaltoFila } from "./saltoFila";

const FILAS = [4, 5, 7, 8, 12];

describe("resolverSaltoFila", () => {
  it("la primera fila de datos es la 4", () => {
    expect(PRIMERA_FILA_DATOS).toBe(4);
  });

  it("salta a una fila presente sin mensaje", () => {
    expect(resolverSaltoFila(FILAS, 7)).toEqual({ destino: 7, mensaje: null });
  });

  it("una fila ausente dentro del rango salta a la siguiente existente y avisa", () => {
    expect(resolverSaltoFila(FILAS, 9)).toEqual({
      destino: 12,
      mensaje: "La fila 9 del Excel no está en el sistema (sin cédula o cédula repetida); se muestra la 12.",
    });
  });

  it("si la 4 no está, salta a la primera existente", () => {
    expect(resolverSaltoFila([6, 9], 4)).toEqual({
      destino: 6,
      mensaje: "La fila 4 del Excel no está en el sistema (sin cédula o cédula repetida); se muestra la 6.",
    });
  });

  it("antes de la 4 muestra el rango válido", () => {
    expect(resolverSaltoFila(FILAS, 3)).toEqual({ destino: null, mensaje: "Escribe una fila entre 4 y 12." });
  });

  it("después de la última muestra el rango válido", () => {
    expect(resolverSaltoFila(FILAS, 13)).toEqual({ destino: null, mensaje: "Escribe una fila entre 4 y 12." });
  });

  it("un número no entero o NaN muestra el rango válido", () => {
    expect(resolverSaltoFila(FILAS, 5.5)).toEqual({ destino: null, mensaje: "Escribe una fila entre 4 y 12." });
    expect(resolverSaltoFila(FILAS, Number.NaN)).toEqual({ destino: null, mensaje: "Escribe una fila entre 4 y 12." });
  });

  it("sin filas avisa que no hay filas", () => {
    expect(resolverSaltoFila([], 4)).toEqual({ destino: null, mensaje: "No hay filas." });
  });
});
