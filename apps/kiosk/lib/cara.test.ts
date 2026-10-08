import { describe, expect, it } from "vitest";
import { caraDeResultado, diasParaVencer, textoPorVencer, tonoDeCara } from "./cara";

const AHORA = new Date("2026-10-08T12:00:00Z");
const enDias = (n: number) => new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe("diasParaVencer", () => {
  it("devuelve null sin fecha", () => {
    expect(diasParaVencer(null, AHORA)).toBeNull();
  });

  it("redondea hacia arriba los días restantes", () => {
    expect(diasParaVencer(enDias(3), AHORA)).toBe(3);
    expect(diasParaVencer(new Date(AHORA.getTime() + 36 * 60 * 60 * 1000).toISOString(), AHORA)).toBe(2);
  });
});

describe("caraDeResultado", () => {
  it("activo con vencimiento lejano es permitido", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(10) }, AHORA).cara).toBe("permitido");
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(6) }, AHORA).cara).toBe("permitido");
  });

  it("activo que vence en 5 días o menos es por_vencer", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(5) }, AHORA)).toEqual({ cara: "por_vencer", diasParaVencer: 5 });
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(1) }, AHORA).cara).toBe("por_vencer");
  });

  it("activo sin fecha de vencimiento es permitido (no rompe)", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: null }, AHORA)).toEqual({ cara: "permitido", diasParaVencer: null });
  });

  it("los demás estados pasan tal cual, aunque la fecha ya haya pasado", () => {
    expect(caraDeResultado({ estado: "en_gracia", fechaVencimiento: enDias(-2) }, AHORA).cara).toBe("en_gracia");
    expect(caraDeResultado({ estado: "vencido", fechaVencimiento: enDias(-40) }, AHORA).cara).toBe("vencido");
    expect(caraDeResultado({ estado: "abono_vencido", fechaVencimiento: null }, AHORA).cara).toBe("abono_vencido");
    expect(caraDeResultado({ estado: "sucursal_incorrecta", fechaVencimiento: null }, AHORA).cara).toBe("sucursal_incorrecta");
  });
});

describe("tonoDeCara", () => {
  it("verde con acceso, ámbar en gracia, rojo en el resto", () => {
    expect(tonoDeCara("permitido")).toBe("verde");
    expect(tonoDeCara("por_vencer")).toBe("verde");
    expect(tonoDeCara("en_gracia")).toBe("ambar");
    expect(tonoDeCara("vencido")).toBe("rojo");
    expect(tonoDeCara("abono_vencido")).toBe("rojo");
    expect(tonoDeCara("sucursal_incorrecta")).toBe("rojo");
  });
});

describe("textoPorVencer", () => {
  it("usa hoy, mañana o N días", () => {
    expect(textoPorVencer(0)).toBe("Vence hoy");
    expect(textoPorVencer(1)).toBe("Vence mañana");
    expect(textoPorVencer(4)).toBe("Vence en 4 días");
  });
});
