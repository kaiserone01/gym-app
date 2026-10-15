import { describe, expect, test } from "vitest";
import { instanteEfectivo } from "./relojEfectivo";

const guardado = new Date("2026-10-15T16:00:00Z");

describe("instanteEfectivo", () => {
  test("sin hora guardada usa el reloj del TV", () => {
    const tv = new Date("2026-10-15T10:00:00Z");
    expect(instanteEfectivo(tv, null)).toBe(tv);
  });
  test("si el reloj del TV está adelantado al guardado, usa el del TV", () => {
    const tv = new Date("2026-10-15T17:00:00Z");
    expect(instanteEfectivo(tv, guardado)).toBe(tv);
  });
  test("tras un corte de luz el reloj retrocede (1970): usa la hora guardada", () => {
    expect(instanteEfectivo(new Date("1970-01-01T00:00:05Z"), guardado)).toBe(guardado);
  });
  test("reloj del TV inválido: usa la hora guardada", () => {
    expect(instanteEfectivo(new Date("no es fecha"), guardado)).toBe(guardado);
  });
  test("hora guardada inválida: usa el reloj del TV", () => {
    const tv = new Date("2026-10-15T10:00:00Z");
    expect(instanteEfectivo(tv, new Date("x"))).toBe(tv);
  });
});
