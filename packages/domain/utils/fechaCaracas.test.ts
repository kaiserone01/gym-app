import { describe, expect, test } from "vitest";
import { esCumpleanos } from "./fechaCaracas";

// fechaNacimiento se guarda como fecha local a las 00:00 (igual que fechaInscripcion): se crea con el
// constructor local para que el test no dependa de la zona horaria de la máquina.
const nacio = (mes: number, dia: number) => new Date(1990, mes - 1, dia);

describe("esCumpleanos", () => {
  test("sin fecha de nacimiento no es cumpleaños", () => {
    expect(esCumpleanos(null, new Date("2026-10-08T15:00:00Z"))).toBe(false);
  });

  test("true el día del cumpleaños en Caracas", () => {
    expect(esCumpleanos(nacio(10, 8), new Date("2026-10-08T15:00:00Z"))).toBe(true);
  });

  test("false otro día", () => {
    expect(esCumpleanos(nacio(10, 9), new Date("2026-10-08T15:00:00Z"))).toBe(false);
    expect(esCumpleanos(nacio(11, 8), new Date("2026-10-08T15:00:00Z"))).toBe(false);
  });

  test("de noche en Caracas (ya es el día siguiente en UTC) cuenta el día de Caracas", () => {
    // 22:00 del 8 de octubre en Caracas = 02:00 UTC del 9.
    const ahora = new Date("2026-10-09T02:00:00Z");
    expect(esCumpleanos(nacio(10, 8), ahora)).toBe(true);
    expect(esCumpleanos(nacio(10, 9), ahora)).toBe(false);
  });

  test("de madrugada en UTC todavía es el día anterior en Caracas", () => {
    // 23:00 del 7 de octubre en Caracas = 03:00 UTC del 8.
    const ahora = new Date("2026-10-08T03:00:00Z");
    expect(esCumpleanos(nacio(10, 7), ahora)).toBe(true);
    expect(esCumpleanos(nacio(10, 8), ahora)).toBe(false);
  });
});
