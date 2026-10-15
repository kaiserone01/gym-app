import { describe, expect, test } from "vitest";
import { crearEmisor } from "./emisorEventos";

describe("crearEmisor", () => {
  test("entrega el evento a los oyentes de esa clave y devuelve cuántos recibieron", () => {
    const emisor = crearEmisor();
    const a: string[] = [];
    const b: string[] = [];
    emisor.suscribir("sede-1", (e) => a.push(e));
    emisor.suscribir("sede-1", (e) => b.push(e));
    expect(emisor.emitir("sede-1", "vitrina:cambio")).toBe(2);
    expect(a).toEqual(["vitrina:cambio"]);
    expect(b).toEqual(["vitrina:cambio"]);
  });

  test("no cruza claves", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    emisor.suscribir("sede-1", (e) => recibidos.push(e));
    expect(emisor.emitir("sede-2", "vitrina:cambio")).toBe(0);
    expect(recibidos).toEqual([]);
  });

  test("al desuscribirse ya no recibe", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    const baja = emisor.suscribir("s", (e) => recibidos.push(e));
    baja();
    expect(emisor.emitir("s", "x")).toBe(0);
    expect(recibidos).toEqual([]);
  });

  test("un oyente que lanza no impide avisar a los demás", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    emisor.suscribir("s", () => {
      throw new Error("conexión cerrada");
    });
    emisor.suscribir("s", (e) => recibidos.push(e));
    expect(emisor.emitir("s", "x")).toBe(1);
    expect(recibidos).toEqual(["x"]);
  });
});
