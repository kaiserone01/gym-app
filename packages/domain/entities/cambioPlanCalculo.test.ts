import { describe, expect, test } from "vitest";
import { calcularCambioPlan } from "./cambioPlanCalculo";

// hoy fijo del enunciado = 2026-09-26 en America/Caracas (UTC-4). Se usa
// mediodía UTC para que la fecha caiga en el día correcto en Caracas sin
// acercarse a la medianoche de ningún lado (16:00Z sigue siendo 26/09 en
// Caracas). Caso A: Luis Mendoza, Corporativo $22/30, vence 05/10/2026,
// diasRestantes = 9, V = $6.60.
const HOY = new Date("2026-09-26T16:00:00Z");
const VENCE_MENDOZA = new Date("2026-10-05T16:00:00Z");

describe("calcularCambioPlan — Caso A (Luis Mendoza, Corporativo $22 -> Diario $3)", () => {
  test("calcula diasRestantes = 9 y valorNoConsumido = $6.60", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: 3,
      diasCicloNuevo: 1,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(9);
    expect(resultado.valorNoConsumidoCentavos).toBe(660);
  });

  test("Solo ajustar vencimiento: 6.60 / 3 = 2.20 -> 2 días, vence 28/09/2026", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: 3,
      diasCicloNuevo: 1,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasNuevos).toBe(2);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-09-28T00:00:00Z"));
  });

  test.each([
    ["00:01", "2026-09-26T04:01:00Z"], // 00:01 Caracas (UTC-4)
    ["12:00", "2026-09-26T16:00:00Z"],
    ["23:59", "2026-09-27T03:59:00Z"], // 23:59 Caracas
  ])("independencia de la hora: %s da el mismo resultado", (_etiqueta, hoyIso) => {
    const resultado = calcularCambioPlan({
      hoy: new Date(hoyIso),
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: 3,
      diasCicloNuevo: 1,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(9);
    expect(resultado.diasNuevos).toBe(2);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-09-28T00:00:00Z"));
  });
});

// Tabla completa del enunciado — Caso A: Luis Mendoza, Corporativo $22/30,
// vence 05/10/2026 (diasRestantes=9, V=$6.60).
describe("calcularCambioPlan — Caso A, tabla completa (AJUSTAR_VENCIMIENTO)", () => {
  test.each([
    ["Con entrenador", 30, 30, 7, "2026-10-03T00:00:00Z"],
    ["Sin entrenador", 25, 30, 8, "2026-10-04T00:00:00Z"],
    ["Plan Viejo", 20, 30, 10, "2026-10-06T00:00:00Z"],
    ["Semanal", 8, 7, 6, "2026-10-02T00:00:00Z"],
  ])("%s: diasNuevos y vencimiento correctos", (_nombre, precioNuevo, diasCicloNuevo, diasNuevosEsperado, vencimientoEsperado) => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo,
      diasCicloNuevo,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasNuevos).toBe(diasNuevosEsperado);
    expect(resultado.nuevoVencimiento).toEqual(new Date(vencimientoEsperado));
  });
});

describe("calcularCambioPlan — CICLO_COMPLETO (Caso A, Mendoza)", () => {
  test.each([
    ["Diario", 3, 1, 300, "2026-09-29T00:00:00Z"],
    ["Con entrenador", 30, 30, 3000, "2026-11-02T00:00:00Z"],
    ["Sin entrenador", 25, 30, 2500, "2026-11-03T00:00:00Z"],
    ["Plan Viejo", 20, 30, 2000, "2026-11-05T00:00:00Z"],
    ["Semanal", 8, 7, 800, "2026-10-09T00:00:00Z"],
  ])("%s: cobra el precio completo y vence hoy + diasNuevos + diasCicloNuevo", (_nombre, precioNuevo, diasCicloNuevo, montoCobradoEsperadoCentavos, vencimientoEsperado) => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo,
      diasCicloNuevo,
      modo: "CICLO_COMPLETO",
    });

    expect(resultado.montoCobradoCentavos).toBe(montoCobradoEsperadoCentavos);
    expect(resultado.nuevoVencimiento).toEqual(new Date(vencimientoEsperado));
  });

  test("nunca acredita dinero — el valor restante no se pierde ni se devuelve como negativo", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: 3,
      diasCicloNuevo: 1,
      modo: "CICLO_COMPLETO",
    });

    // V=$6.60 > precio Diario $3 — el excedente ($3.60) queda documentado
    // como valorNoConsumidoCentavos, nunca como un monto negativo a cobrar.
    expect(resultado.montoCobradoCentavos).toBeGreaterThanOrEqual(0);
  });
});

describe("calcularCambioPlan — Plan de $0 (Cortesía)", () => {
  test("bloquea el cambio cuando diasRestantes > 0, en ambos modos", () => {
    expect(() =>
      calcularCambioPlan({
        hoy: HOY,
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: VENCE_MENDOZA,
        precioNuevo: 0,
        diasCicloNuevo: 30,
        modo: "AJUSTAR_VENCIMIENTO",
      })
    ).toThrow();

    expect(() =>
      calcularCambioPlan({
        hoy: HOY,
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: VENCE_MENDOZA,
        precioNuevo: 0,
        diasCicloNuevo: 30,
        modo: "CICLO_COMPLETO",
      })
    ).toThrow();
  });

  test("no bloquea si el plan nuevo de $0 se elige con diasRestantes = 0 (vencido)", () => {
    const vencidoAyer = new Date("2026-09-25T16:00:00Z");
    expect(() =>
      calcularCambioPlan({
        hoy: HOY,
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: vencidoAyer,
        precioNuevo: 0,
        diasCicloNuevo: 30,
        modo: "CICLO_COMPLETO",
      })
    ).not.toThrow();
  });
});

describe("calcularCambioPlan — vencido (diasRestantes = 0)", () => {
  const vencidoAyer = new Date("2026-09-25T16:00:00Z");

  test("V = 0 y AJUSTAR_VENCIMIENTO no mueve el vencimiento más allá de hoy", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: vencidoAyer,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(0);
    expect(resultado.valorNoConsumidoCentavos).toBe(0);
    expect(resultado.diasNuevos).toBe(0);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-09-26T00:00:00Z"));
  });

  test("CICLO_COMPLETO cobra el precio completo y vence hoy + diasCicloNuevo", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: vencidoAyer,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "CICLO_COMPLETO",
    });

    expect(resultado.montoCobradoCentavos).toBe(800);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-03T00:00:00Z"));
  });
});

describe("calcularCambioPlan — conservación del valor", () => {
  test.each([
    ["Corporativo->Diario", 22, 30, 3, 1],
    ["SinEntrenador->Semanal", 25, 30, 8, 7],
    ["ConEntrenador->PlanViejo", 30, 30, 20, 30],
    ["Semanal->Corporativo", 8, 7, 22, 30],
  ])("%s: |diasNuevos*tarifaNueva - V| <= tarifaNueva/2", (_nombre, precioViejo, diasCicloViejo, precioNuevo, diasCicloNuevo) => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo,
      diasCicloViejo,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo,
      diasCicloNuevo,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    const tarifaNuevaCentavos = (precioNuevo * 100) / diasCicloNuevo;
    const diferencia = Math.abs(resultado.diasNuevos * tarifaNuevaCentavos - resultado.valorNoConsumidoCentavos);
    expect(diferencia).toBeLessThanOrEqual(tarifaNuevaCentavos / 2 + 0.001);
  });
});

// Ida y vuelta A->B->A: cada conversión de "valor no consumido" a "días del
// plan nuevo" redondea al entero más cercano, así que puede desviarse hasta
// tarifaNueva/2 de dinero. Ese error de dinero se vuelve error de DÍAS al
// convertir de nuevo — y como las tarifas diarias de A y B pueden ser muy
// distintas, un mismo error en dinero pesa distinto en días según hacia
// qué plan se convierta. La tolerancia no es un número fijo: es
// ceil(0.5 + 0.5 * tarifaDiariaB / tarifaDiariaA) días, que suma el redondeo
// del primer paso (medio día de B) más el del segundo paso (medio día de B
// expresado en unidades de A). Esto es lo que garantiza el test de
// conservación de valor por paso (ver describe de más arriba); este test
// solo documenta cuánto se traduce eso a días cuando se hace ida y vuelta.
describe("calcularCambioPlan — ida y vuelta", () => {
  test.each([
    ["Corporativo($22/30) <-> Semanal($8/7)", 22, 30, 8, 7],
    ["Diario($3/1) <-> Plan Viejo($20/30)", 3, 1, 20, 30],
  ])("%s: A->B->A devuelve el vencimiento original dentro de la tolerancia de redondeo", (_nombre, precioA, diasCicloA, precioB, diasCicloB) => {
    const aB = calcularCambioPlan({
      hoy: HOY,
      precioViejo: precioA,
      diasCicloViejo: diasCicloA,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: precioB,
      diasCicloNuevo: diasCicloB,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    const bA = calcularCambioPlan({
      hoy: HOY,
      precioViejo: precioB,
      diasCicloViejo: diasCicloB,
      fechaVencimientoActual: aB.nuevoVencimiento,
      precioNuevo: precioA,
      diasCicloNuevo: diasCicloA,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    const tarifaDiariaA = precioA / diasCicloA;
    const tarifaDiariaB = precioB / diasCicloB;
    const toleranciaDias = Math.ceil(0.5 + 0.5 * (tarifaDiariaB / tarifaDiariaA));

    const diferenciaDias = Math.abs(
      (bA.nuevoVencimiento.getTime() - VENCE_MENDOZA.getTime()) / 86_400_000
    );
    expect(diferenciaDias).toBeLessThanOrEqual(toleranciaDias);
  });
});

describe("calcularCambioPlan — casos borde de fecha", () => {
  test("vence hoy mismo (diasRestantes = 0)", () => {
    const venceHoy = new Date("2026-09-26T20:00:00Z"); // 26/09 en Caracas también
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: venceHoy,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(0);
    expect(resultado.valorNoConsumidoCentavos).toBe(0);
  });

  test("vence mañana (diasRestantes = 1)", () => {
    const veneceManana = new Date("2026-09-27T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: veneceManana,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(1);
  });

  test("cambio de mes y de año: vence en enero del año siguiente", () => {
    const finDeAnio = new Date("2027-01-05T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: finDeAnio,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    // 26/09/2026 -> 05/01/2027 = 101 días de calendario.
    expect(resultado.diasRestantes).toBe(101);
  });

  test("febrero: vence el 28/02 de un año no bisiesto", () => {
    const hoyFebrero = new Date("2026-02-01T16:00:00Z");
    const venceFinDeFebrero = new Date("2026-02-28T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: hoyFebrero,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: venceFinDeFebrero,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(27);
  });
});

describe("calcularCambioPlan — precio con centavos", () => {
  test("22.99 no rompe el redondeo a centavos enteros", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22.99,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_MENDOZA,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(Number.isInteger(resultado.valorNoConsumidoCentavos)).toBe(true);
    expect(Number.isInteger(resultado.diasNuevos)).toBe(true);
  });
});

// Caso B: Luis Castro, Sin entrenador $25/30, vence 02/06/2027
// (diasRestantes=249, V=$207.50).
describe("calcularCambioPlan — Caso B (Luis Castro, Sin entrenador $25 -> varios)", () => {
  const VENCE_CASTRO = new Date("2027-06-02T16:00:00Z");

  test("diasRestantes = 249 y valorNoConsumido = $207.50", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 25,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_CASTRO,
      precioNuevo: 8,
      diasCicloNuevo: 7,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasRestantes).toBe(249);
    expect(resultado.valorNoConsumidoCentavos).toBe(20750);
  });

  test.each([
    ["Corporativo", 22, 30, 283, "2027-07-06T00:00:00Z"],
    ["Diario", 3, 1, 69, "2026-12-04T00:00:00Z"],
    ["Con entrenador", 30, 30, 208, "2027-04-22T00:00:00Z"],
    ["Plan Viejo", 20, 30, 311, "2027-08-03T00:00:00Z"],
    ["Semanal", 8, 7, 182, "2027-03-27T00:00:00Z"],
  ])("%s: diasNuevos y vencimiento correctos", (_nombre, precioNuevo, diasCicloNuevo, diasNuevosEsperado, vencimientoEsperado) => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 25,
      diasCicloViejo: 30,
      fechaVencimientoActual: VENCE_CASTRO,
      precioNuevo,
      diasCicloNuevo,
      modo: "AJUSTAR_VENCIMIENTO",
    });

    expect(resultado.diasNuevos).toBe(diasNuevosEsperado);
    expect(resultado.nuevoVencimiento).toEqual(new Date(vencimientoEsperado));
  });
});
