import { describe, expect, test } from "vitest";
import { clasificarFila } from "./clasificarFila";
import type { FilaNormalizada, MapeoPlanEntry, ReglasCedula } from "./tipos";

const FECHA_PLACEHOLDER = new Date("2026-10-05T00:00:00.000Z");
const placeholderFecha = () => FECHA_PLACEHOLDER;

function filaNormalizadaBase(overrides: Partial<FilaNormalizada>): FilaNormalizada {
  return {
    numeroFila: 50,
    nombre: "Juan Perez",
    estado: "ACTIVA",
    cedulaOriginal: "12345678",
    celularOriginal: null,
    plan: { tipo: "dominante", valorUSD: 20 },
    fVenc: { tipo: "valida", fecha: new Date("2026-12-01T00:00:00.000Z") },
    fechaPago: { tipo: "vacia" },
    ...overrides,
  };
}

const mapeoVacio: MapeoPlanEntry[] = [];
const reglasCedulaVacias: ReglasCedula = { vaciaAccion: "placeholder", duplicados: [] };

describe("clasificarFila — caso limpio", () => {
  test("plan dominante + status con dato + fecha válida → migrada sin flags", () => {
    const resultado = clasificarFila(filaNormalizadaBase({}), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toEqual([]);
      expect(resultado.datos.cedula).toBe("12345678");
      expect(resultado.datos.precioPlanUSD).toBe(20);
      expect(resultado.datos.estado).toBe("ACTIVA");
    }
  });

  test("celularOriginal presente se migra tal cual en datos.celular, sin lógica especial", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ celularOriginal: "ESPAÑA" }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.celular).toBe("ESPAÑA");
    }
  });

  test("celularOriginal null se migra como celular null", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ celularOriginal: null }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.celular).toBe(null);
    }
  });
});

describe("clasificarFila — status sin dato", () => {
  test("estado null → excluida status-sin-dato", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ estado: null }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "status-sin-dato", numeroFila: 50 });
  });
});

describe("clasificarFila — cedula vacía", () => {
  test("cedulaOriginal null → migrada con flag cedula-placeholder y cedula PLACEHOLDER-<numeroFila>", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("cedula-placeholder");
      expect(resultado.datos.cedula).toBe("PLACEHOLDER-47");
    }
  });

  test("mismo numeroFila siempre genera el mismo placeholder (determinístico)", () => {
    const r1 = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    const r2 = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(r1).toEqual(r2);
  });
});

describe("clasificarFila — plan sin mapeo", () => {
  test("plan requiereMapeo sin entrada en mapeoPlan → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "sin-mapeo-plan-definido", numeroFila: 50, detalle: "TV" });
  });

  test("plan requiereMapeo con accion pendiente → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } });
    const mapeo: MapeoPlanEntry[] = [{ valorExcel: "TV", accion: "pendiente" }];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "sin-mapeo-plan-definido", numeroFila: 50, detalle: "TV" });
  });

  test("plan requiereMapeo con accion excluir → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "Pend" } });
    const mapeo: MapeoPlanEntry[] = [{ valorExcel: "Pend", accion: "excluir" }];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("excluida");
  });

  test("plan requiereMapeo con accion mapear → migrada con flag plan-legacy si corresponde", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "17.5" } });
    const mapeo: MapeoPlanEntry[] = [
      { valorExcel: "17.5", accion: "mapear", planNombreDestino: "Plan $20 (legacy)", precioPlanOverrideUSD: 17.5, planLegacy: true },
    ];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("plan-legacy");
      expect(resultado.datos.precioPlanUSD).toBe(17.5);
      expect(resultado.datos.planNombre).toBe("Plan $20 (legacy)");
      expect(resultado.datos.planLegacy).toBe(true);
    }
  });
});

describe("clasificarFila — fecha de vencimiento inválida", () => {
  test("fVenc invalida → migrada con flag fecha-vencimiento-placeholder y fecha inyectada", () => {
    const fila = filaNormalizadaBase({ fVenc: { tipo: "invalida", motivo: "malformada", valorOriginal: "19-082026" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("fecha-vencimiento-placeholder");
      expect(resultado.datos.fechaVencimiento).toEqual(FECHA_PLACEHOLDER);
    }
  });
});

describe("clasificarFila — FECHA PAGO nota de texto", () => {
  test("fechaPago notaTexto → migrada con flag pago-aproximado y Pago monto 0", () => {
    const fila = filaNormalizadaBase({ fechaPago: { tipo: "notaTexto", texto: "Intercambio" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("pago-aproximado");
      expect(resultado.datos.pago).toEqual({ monto: 0, metodo: "Intercambio", fechaPago: fila.fVenc.tipo === "valida" ? fila.fVenc.fecha : FECHA_PLACEHOLDER });
    }
  });

  test("fechaPago vacia → migrada sin Pago adicional", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ fechaPago: { tipo: "vacia" } }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.pago).toBe(null);
    }
  });
});

describe("clasificarFila — fechaUltimoPago (spec §3.7)", () => {
  test("fechaPago tipo fecha real → datos.fechaUltimoPago es esa fecha exacta, sin Pago adicional", () => {
    const fechaReal = new Date("2026-08-15T00:00:00.000Z");
    const resultado = clasificarFila(
      filaNormalizadaBase({ fechaPago: { tipo: "fecha", fecha: fechaReal } }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.fechaUltimoPago).toEqual(fechaReal);
      expect(resultado.datos.pago).toBe(null);
    }
  });

  test("fechaPago notaTexto → datos.fechaUltimoPago = fechaVencimiento (mismo valor usado en Pago aproximado)", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ fechaPago: { tipo: "notaTexto", texto: "Intercambio" } }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.fechaUltimoPago).toEqual(resultado.datos.fechaVencimiento);
    }
  });

  test("fechaPago vacia → datos.fechaUltimoPago es null", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ fechaPago: { tipo: "vacia" } }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.fechaUltimoPago).toBe(null);
    }
  });
});

describe("clasificarFila — precio de plan mapeado sin override (spec §2/§3.5)", () => {
  test("mapear sin precioPlanOverrideUSD y valorExcel numerico → usa ese numero como precio, no 0", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "15" } });
    const mapeo: MapeoPlanEntry[] = [
      { valorExcel: "15", accion: "mapear", planNombreDestino: "Plan $15" },
    ];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.precioPlanUSD).toBe(15);
    }
  });

  test("mapear sin precioPlanOverrideUSD y valorExcel no numerico → precio cae a 0 (sin otra senal disponible)", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "Pend" } });
    const mapeo: MapeoPlanEntry[] = [
      { valorExcel: "Pend", accion: "mapear", planNombreDestino: "Plan $20" },
    ];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.precioPlanUSD).toBe(0);
    }
  });
});

describe("clasificarFila — duplicados de cedula", () => {
  test("fila es la ganadora de un par fusionable → migrada, sin exclusión", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "22969126", filaA: 812, filaB: 951, fusionar: true, filaGanadora: 951 }],
    };
    const fila = filaNormalizadaBase({ numeroFila: 951, cedulaOriginal: "22969126" });
    const resultado = clasificarFila(fila, mapeoVacio, reglas, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.filaFusionadaDescartada).toBe(812);
    }
  });

  test("fila es la perdedora de un par fusionable → excluida duplicado-pendiente-revision", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "22969126", filaA: 812, filaB: 951, fusionar: true, filaGanadora: 951 }],
    };
    const fila = filaNormalizadaBase({ numeroFila: 812, cedulaOriginal: "22969126" });
    const resultado = clasificarFila(fila, mapeoVacio, reglas, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "duplicado-pendiente-revision", numeroFila: 812, detalle: "22969126" });
  });

  test("par marcado fusionar:false → ambas migran, la no ganadora con cédula placeholder", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "11111111", filaA: 100, filaB: 200, fusionar: false, filaGanadora: 200 }],
    };
    const filaA = filaNormalizadaBase({ numeroFila: 100, cedulaOriginal: "11111111" });
    const filaB = filaNormalizadaBase({ numeroFila: 200, cedulaOriginal: "11111111" });
    const a = clasificarFila(filaA, mapeoVacio, reglas, placeholderFecha);
    const b = clasificarFila(filaB, mapeoVacio, reglas, placeholderFecha);
    expect(a.categoria).toBe("migrada");
    expect(b.categoria).toBe("migrada");
    if (a.categoria === "migrada" && b.categoria === "migrada") {
      expect(a.datos.cedula).toBe("PLACEHOLDER-100");
      expect(a.flags).toContain("cedula-placeholder");
      expect(a.filaFusionadaDescartada).toBeUndefined();
      expect(b.datos.cedula).toBe("11111111");
      expect(b.flags).not.toContain("cedula-placeholder");
      expect(b.filaFusionadaDescartada).toBeUndefined();
    }
  });
});

describe("clasificarFila — aproximacion de plan legacy", () => {
  const mapeo: MapeoPlanEntry[] = [
    { valorExcel: "15", accion: "mapear", planNombreDestino: "Plan $15 (legacy)", precioPlanOverrideUSD: 15, planLegacy: true },
    { valorExcel: "0", accion: "mapear", planNombreDestino: "Cortesia", precioPlanOverrideUSD: 0, planLegacy: true },
  ];
  const hoy = new Date("2026-09-29T00:00:00.000Z");
  const conPlan = (valor: string, fVenc: FilaNormalizada["fVenc"]) =>
    filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: valor }, fVenc });

  test("vencido hace más de 2 meses → plan real más cercano, con precio original", () => {
    const r = clasificarFila(conPlan("15", { tipo: "valida", fecha: new Date("2026-05-01T00:00:00.000Z") }), mapeo, reglasCedulaVacias, placeholderFecha, hoy);
    expect(r.categoria).toBe("migrada");
    if (r.categoria === "migrada") {
      expect(r.datos.planNombre).toBe("Plan $20");
      expect(r.datos.planLegacy).toBe(false);
      expect(r.datos.precioPlanOriginalUSD).toBe(15);
      expect(r.flags).toContain("plan-aproximado");
      expect(r.flags).not.toContain("plan-legacy");
    }
  });

  test("vencido hace menos de 2 meses → sigue como plan legacy", () => {
    const r = clasificarFila(conPlan("15", { tipo: "valida", fecha: new Date("2026-08-20T00:00:00.000Z") }), mapeo, reglasCedulaVacias, placeholderFecha, hoy);
    if (r.categoria === "migrada") {
      expect(r.datos.planNombre).toBe("Plan $15 (legacy)");
      expect(r.flags).toContain("plan-legacy");
      expect(r.datos.precioPlanOriginalUSD).toBeUndefined();
    }
  });

  test("sin fecha de vencimiento real → sigue como plan legacy", () => {
    const r = clasificarFila(conPlan("15", { tipo: "invalida", motivo: "vacia", valorOriginal: null }), mapeo, reglasCedulaVacias, placeholderFecha, hoy);
    if (r.categoria === "migrada") expect(r.datos.planNombre).toBe("Plan $15 (legacy)");
  });

  test("cortesía ($0) nunca se aproxima", () => {
    const r = clasificarFila(conPlan("0", { tipo: "valida", fecha: new Date("2025-01-01T00:00:00.000Z") }), mapeo, reglasCedulaVacias, placeholderFecha, hoy);
    if (r.categoria === "migrada") expect(r.datos.planNombre).toBe("Cortesia");
  });
});
