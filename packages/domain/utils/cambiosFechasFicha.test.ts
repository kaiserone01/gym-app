import { describe, expect, it } from "vitest";
import { calcularCambiosFechas } from "./cambiosFechasFicha";

const local = (texto: string) => new Date(`${texto}T00:00:00`);

describe("calcularCambiosFechas", () => {
  it("sin cambios devuelve {}", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-10-01", vencimientoOriginal: "2026-10-01", pago: "2026-09-01", pagoOriginal: "2026-09-01" })
    ).toEqual({});
  });

  it("solo cambió el vencimiento", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-11-01", vencimientoOriginal: "2026-10-01", pago: "2026-09-01", pagoOriginal: "2026-09-01" })
    ).toEqual({ fechaVencimiento: local("2026-11-01") });
  });

  it("solo cambió la fecha de pago", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-10-01", vencimientoOriginal: "2026-10-01", pago: "2026-09-15", pagoOriginal: "2026-09-01" })
    ).toEqual({ fechaUltimoPago: local("2026-09-15") });
  });

  it("cambiaron ambas", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-11-01", vencimientoOriginal: "2026-10-01", pago: "2026-10-01", pagoOriginal: "" })
    ).toEqual({ fechaVencimiento: local("2026-11-01"), fechaUltimoPago: local("2026-10-01") });
  });

  it("vaciar la fecha de pago es un cambio → null", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-10-01", vencimientoOriginal: "2026-10-01", pago: "", pagoOriginal: "2026-09-01" })
    ).toEqual({ fechaUltimoPago: null });
  });

  it("campos ausentes (miembro normal) devuelven {}", () => {
    expect(calcularCambiosFechas({ vencimiento: null, vencimientoOriginal: null, pago: null, pagoOriginal: null })).toEqual({});
  });

  it("pago ausente se omite aunque haya un original", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "2026-10-01", vencimientoOriginal: "2026-10-01", pago: null, pagoOriginal: "2026-09-01" })
    ).toEqual({});
  });

  it("pago vacío con original ausente (null) no es un cambio", () => {
    expect(calcularCambiosFechas({ vencimiento: null, vencimientoOriginal: null, pago: "", pagoOriginal: null })).toEqual({});
  });

  it("el vencimiento vacío se omite (un vencimiento no se vacía)", () => {
    expect(
      calcularCambiosFechas({ vencimiento: "", vencimientoOriginal: "2026-10-01", pago: "2026-09-01", pagoOriginal: "2026-09-01" })
    ).toEqual({});
  });

  it("vencimiento nuevo sin original se incluye", () => {
    expect(calcularCambiosFechas({ vencimiento: "2026-10-01", vencimientoOriginal: null, pago: null, pagoOriginal: null })).toEqual({
      fechaVencimiento: local("2026-10-01"),
    });
  });
});
