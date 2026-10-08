import { describe, expect, it } from "vitest";
import { estadoInicial, reducirPantalla, type Ficha } from "./estadoPantalla";

const errorFicha: Ficha = { tipo: "error", mensaje: "No se encontró ningún miembro con esa cédula." };
const pendiente: Ficha = { tipo: "pendiente" };

describe("reducirPantalla", () => {
  it("arranca en reposo: sin ficha y sin procesar", () => {
    expect(estadoInicial).toEqual({ ficha: null, procesando: false, siguienteId: 1 });
  });

  it("enviar marca procesando sin tocar la ficha visible", () => {
    const conFicha = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const enviando = reducirPantalla(conFicha, { tipo: "enviar" });
    expect(enviando.procesando).toBe(true);
    expect(enviando.ficha).toEqual(conFicha.ficha);
  });

  it("una respuesta muestra la ficha con id nuevo y deja de procesar", () => {
    const e = reducirPantalla(reducirPantalla(estadoInicial, { tipo: "enviar" }), { tipo: "respuesta", ficha: errorFicha });
    expect(e.procesando).toBe(false);
    expect(e.ficha).toEqual({ ...errorFicha, id: 1 });
    expect(e.siguienteId).toBe(2);
  });

  it("otra respuesta con una ficha visible la reemplaza directo (id mayor)", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const e2 = reducirPantalla(e1, { tipo: "respuesta", ficha: pendiente });
    expect(e2.ficha).toEqual({ tipo: "pendiente", id: 2 });
  });

  it("vencio con el id vigente vuelve al reposo", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    expect(reducirPantalla(e1, { tipo: "vencio", id: 1 }).ficha).toBeNull();
  });

  it("vencio con un id viejo NO borra la ficha nueva", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const e2 = reducirPantalla(e1, { tipo: "respuesta", ficha: pendiente });
    expect(reducirPantalla(e2, { tipo: "vencio", id: 1 })).toBe(e2);
  });
});
