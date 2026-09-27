import { describe, expect, test } from "vitest";
import { calcularCambioPlan, PlanCortesiaConTiempoRestanteError } from "./cambioPlanCalculo";

// hoy fijo = 2026-09-27 en America/Caracas (UTC-4). Se usa mediodía UTC
// para que la fecha caiga en el día correcto en Caracas sin acercarse a la
// medianoche de ningún lado.
const HOY = new Date("2026-09-27T16:00:00Z");

describe("calcularCambioPlan — V > precioNuevo (excedente absorbido en días, sin cobro)", () => {
  test("plan $30/30d con 20 días restantes -> plan $25/30d: sin cobro, excedente en días", () => {
    // V = 20 * (30/30) = $20.00. precioNuevo = $25. V < precioNuevo acá, no
    // sirve para este describe — se ajusta el vencimiento para que V supere
    // el precio nuevo: 30 días restantes -> V = $30.00 > $25.
    const vence = new Date("2026-10-27T16:00:00Z"); // 30 días desde hoy
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 30,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 25,
      diasCicloNuevo: 30,
    });

    // V = $30.00, precioNuevo = $25.00, excedente = $5.00 -> tarifa nueva
    // $25/30 = $0.8333/día -> 5 / 0.8333 = 6 días extra.
    expect(resultado.diasRestantes).toBe(30);
    expect(resultado.valorNoConsumidoCentavos).toBe(3000);
    expect(resultado.montoCobradoCentavos).toBe(0);
    expect(resultado.diasNuevos).toBe(6);
    // Vence hoy + diasCicloNuevo (30) + diasNuevos (6) = 36 días desde hoy.
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-11-02T00:00:00Z"));
  });
});

describe("calcularCambioPlan — V < precioNuevo (cobra la diferencia, ciclo normal)", () => {
  test("plan $25/30d con 9 días restantes -> plan $30/30d: cobra la diferencia", () => {
    const vence = new Date("2026-10-06T16:00:00Z"); // 9 días desde hoy
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 25,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 30,
      diasCicloNuevo: 30,
    });

    // V = 9 * (25/30) = $7.50. precioNuevo = $30.00. Diferencia = $22.50.
    expect(resultado.diasRestantes).toBe(9);
    expect(resultado.valorNoConsumidoCentavos).toBe(750);
    expect(resultado.montoCobradoCentavos).toBe(2250);
    expect(resultado.diasNuevos).toBe(0);
    // Vence hoy + diasCicloNuevo (30), sin días extra.
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-27T00:00:00Z"));
  });

  test("caso Luis Mendoza — Corporativo 9 días restantes -> Con entrenador $30: cobra la diferencia y avanza un ciclo completo desde hoy", () => {
    const vence = new Date("2026-10-06T16:00:00Z"); // 9 días desde hoy
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 30,
      diasCicloNuevo: 30,
    });

    // V = 9 * (22/30) = $6.60. precioNuevo = $30.00. Diferencia = $23.40.
    expect(resultado.valorNoConsumidoCentavos).toBe(660);
    expect(resultado.montoCobradoCentavos).toBe(2340);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-27T00:00:00Z"));
  });
});

describe("calcularCambioPlan — V == precioNuevo, mismo ciclo/frecuencia (sin cobro, avanza un ciclo)", () => {
  test("plan $30/30d con 25 días restantes -> plan $25/30d: V=$25.00 == precioNuevo, sin cobro", () => {
    const vence = new Date("2026-10-22T16:00:00Z"); // 25 días desde hoy
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 30,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 25,
      diasCicloNuevo: 30,
    });

    // V = 25 * (30/30) = $25.00 == precioNuevo ($25.00).
    expect(resultado.valorNoConsumidoCentavos).toBe(2500);
    expect(resultado.montoCobradoCentavos).toBe(0);
    expect(resultado.diasNuevos).toBe(0);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-27T00:00:00Z"));
  });
});

describe("calcularCambioPlan — V == precioNuevo, CON cambio de frecuencia", () => {
  test("plan mensual $30/30d con 7 días restantes -> plan semanal $7/7d: V=$7.00 == precioNuevo, avanza diasCicloNuevo (7) desde HOY, no desde el vencimiento viejo", () => {
    const vence = new Date("2026-10-04T16:00:00Z"); // 7 días desde hoy
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 30,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 7,
      diasCicloNuevo: 7,
    });

    // V = 7 * (30/30) = $7.00 == precioNuevo ($7.00) — sin cobro.
    expect(resultado.valorNoConsumidoCentavos).toBe(700);
    expect(resultado.montoCobradoCentavos).toBe(0);
    expect(resultado.diasNuevos).toBe(0);
    // "Avanza un ciclo" usa diasCicloNuevo (7 días) contados desde HOY
    // (2026-09-27), no desde el vencimiento viejo (que también caía a los 7
    // días — coincidencia deliberada del fixture para aislar la diferencia:
    // si el código usara la duración del ciclo VIEJO por error, o sumara
    // desde el vencimiento viejo, el resultado sería distinto de lo que se
    // espera acá).
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-04T00:00:00Z"));
  });
});

describe("calcularCambioPlan — Plan de $0 (Cortesía)", () => {
  test("bloquea el cambio cuando diasRestantes > 0", () => {
    const vence = new Date("2026-10-06T16:00:00Z");
    expect(() =>
      calcularCambioPlan({
        hoy: HOY,
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: vence,
        precioNuevo: 0,
        diasCicloNuevo: 30,
      })
    ).toThrow(PlanCortesiaConTiempoRestanteError);
  });

  test("no bloquea si el plan nuevo de $0 se elige con diasRestantes = 0 (vencido)", () => {
    const vencidoAyer = new Date("2026-09-26T16:00:00Z");
    expect(() =>
      calcularCambioPlan({
        hoy: HOY,
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: vencidoAyer,
        precioNuevo: 0,
        diasCicloNuevo: 30,
      })
    ).not.toThrow();
  });
});

describe("calcularCambioPlan — vencido (diasRestantes = 0)", () => {
  const vencidoAyer = new Date("2026-09-26T16:00:00Z");

  test("V = 0 < precioNuevo: cobra el precio completo y avanza un ciclo normal desde hoy", () => {
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: vencidoAyer,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    expect(resultado.diasRestantes).toBe(0);
    expect(resultado.valorNoConsumidoCentavos).toBe(0);
    expect(resultado.montoCobradoCentavos).toBe(800);
    expect(resultado.diasNuevos).toBe(0);
    expect(resultado.nuevoVencimiento).toEqual(new Date("2026-10-04T00:00:00Z"));
  });
});

describe("calcularCambioPlan — casos borde de fecha", () => {
  test("vence hoy mismo (diasRestantes = 0)", () => {
    const venceHoy = new Date("2026-09-27T20:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: venceHoy,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    expect(resultado.diasRestantes).toBe(0);
    expect(resultado.valorNoConsumidoCentavos).toBe(0);
  });

  test("vence mañana (diasRestantes = 1)", () => {
    const veneceManana = new Date("2026-09-28T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: veneceManana,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    expect(resultado.diasRestantes).toBe(1);
  });

  test("cambio de mes y de año: vence en enero del año siguiente", () => {
    const finDeAnio = new Date("2027-01-06T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22,
      diasCicloViejo: 30,
      fechaVencimientoActual: finDeAnio,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    // 27/09/2026 -> 06/01/2027 = 101 días de calendario.
    expect(resultado.diasRestantes).toBe(101);
  });

  test("independencia de la hora: distintas horas del mismo día dan el mismo resultado", () => {
    const vence = new Date("2026-10-06T16:00:00Z");
    const horas = ["2026-09-27T04:01:00Z", "2026-09-27T16:00:00Z", "2026-09-28T03:59:00Z"];
    for (const hoyIso of horas) {
      const resultado = calcularCambioPlan({
        hoy: new Date(hoyIso),
        precioViejo: 22,
        diasCicloViejo: 30,
        fechaVencimientoActual: vence,
        precioNuevo: 30,
        diasCicloNuevo: 30,
      });
      expect(resultado.diasRestantes).toBe(9);
      expect(resultado.montoCobradoCentavos).toBe(2340);
    }
  });
});

describe("calcularCambioPlan — precio con centavos", () => {
  test("22.99 no rompe el redondeo a centavos enteros", () => {
    const vence = new Date("2026-10-06T16:00:00Z");
    const resultado = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 22.99,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    expect(Number.isInteger(resultado.valorNoConsumidoCentavos)).toBe(true);
    expect(Number.isInteger(resultado.diasNuevos)).toBe(true);
    expect(Number.isInteger(resultado.montoCobradoCentavos)).toBe(true);
  });
});

describe("calcularCambioPlan — ida y vuelta", () => {
  test("A->B->A conserva el vencimiento dentro de la tolerancia de redondeo cuando V > precioNuevo en ambos sentidos", () => {
    // Plan A: $30/30d, Plan B: $8/7d. Vencimiento con muchos días restantes
    // para que V supere el precio del plan nuevo en ambos sentidos (mismo
    // camino: excedente absorbido en días).
    const vence = new Date("2027-06-02T16:00:00Z"); // ~248 días

    const aB = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 30,
      diasCicloViejo: 30,
      fechaVencimientoActual: vence,
      precioNuevo: 8,
      diasCicloNuevo: 7,
    });

    const bA = calcularCambioPlan({
      hoy: HOY,
      precioViejo: 8,
      diasCicloViejo: 7,
      fechaVencimientoActual: aB.nuevoVencimiento,
      precioNuevo: 30,
      diasCicloNuevo: 30,
    });

    // Tolerancia generosa: el redondeo a días enteros en cada paso puede
    // acumular hasta unos pocos días de diferencia en un ida y vuelta.
    const diferenciaDias = Math.abs((bA.nuevoVencimiento.getTime() - vence.getTime()) / 86_400_000);
    expect(diferenciaDias).toBeLessThanOrEqual(5);
  });
});
