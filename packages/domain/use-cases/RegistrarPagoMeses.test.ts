import { describe, expect, test } from "vitest";
import {
  registrarPago,
  MesesInvalidosError,
  MesesRequierenPagoCompletoError,
  MesesNoDisponiblesError,
  type RegistrarPagoDeps,
  type DatosRegistrarPago,
} from "./RegistrarPago";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const DIA = 24 * 60 * 60 * 1000;

function crearDeps(opciones: { vigenteHasta?: Date; pagosDelMiembro?: Partial<Pago>[] } = {}) {
  const { vigenteHasta, pagosDelMiembro = [] } = opciones;
  const pagos: DatosNuevoPago[] = [];
  const extensiones: Date[] = [];
  const suscripcionesCreadas: { fin: Date }[] = [];
  const fechasMiembro: { pago: Date; fin: Date }[] = [];

  const deps = {
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagos.push(datos);
        return datos as unknown as Pago;
      },
      listarPorMiembro: async () => pagosDelMiembro,
    },
    suscripciones: {
      buscarActivaVigentePorMiembroYPlan: async () => (vigenteHasta ? { id: "s1", inicio: DIA, fin: vigenteHasta } : null),
      extenderFin: async (_id: string, fin: Date) => {
        extensiones.push(fin);
      },
      actualizarFechaLimiteAbono: async () => undefined,
      ajustarCicloMasReciente: async () => true,
      crear: async (datos: { fin: Date }) => {
        suscripcionesCreadas.push(datos);
      },
    },
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: "s1", planId: "plan1", precioPlan: 25, saldoAFavorUSD: 0, porRegularizar: false }),
      actualizar: async () => null,
      actualizarFechasPago: async (_id: string, pago: Date, fin: Date) => {
        fechasMiembro.push({ pago, fin });
      },
    },
    planes: { buscarPorId: async () => ({ id: "plan1", activo: true, precioUSD: 25, diasCiclo: 30, frecuencia: "MENSUAL", permitePagoParcial: true }) },
    turnos: { buscarAbiertoPorSucursal: async () => ({ id: "turno-hoy" }) },
    sucursales: {},
    autorizacion: { tienePermiso: async () => true },
    reglasAbono: { buscarPorOrganizacionYFrecuencia: async () => null },
  } as unknown as RegistrarPagoDeps;
  return { deps, pagos, extensiones, suscripcionesCreadas, fechasMiembro };
}

const linea = (monto: number, metodo = "Efectivo (USD)") => ({ monto, metodo, metodoPagoId: "mp1", numeroOperacion: null, tasaCambio: null });

function input(extra: Partial<DatosRegistrarPago> = {}): DatosRegistrarPago {
  return {
    organizacionId: "org",
    miembroId: "m1",
    planId: "plan1",
    lineas: [linea(25)],
    sucursalId: "s1",
    registradoPorId: "u1",
    rolUsuario: "SOCIO",
    ...extra,
  };
}

describe("registrarPago con varios meses", () => {
  test("3 meses pagados completos: el ciclo dura 90 días y el pago guarda el total", async () => {
    const { deps, pagos, suscripcionesCreadas } = crearDeps();
    await registrarPago(deps, input({ meses: 3, lineas: [linea(75)] }));

    expect(pagos).toHaveLength(1);
    expect(pagos[0].monto).toBe(75);
    expect(pagos[0].fechaFinCiclo!.getTime() - pagos[0].fechaInicioCiclo!.getTime()).toBe(90 * DIA);
    expect(suscripcionesCreadas[0].fin).toEqual(pagos[0].fechaFinCiclo);
  });

  test("sin indicar meses se comporta como un mes (30 días)", async () => {
    const { deps, pagos } = crearDeps();
    await registrarPago(deps, input());
    expect(pagos[0].fechaFinCiclo!.getTime() - pagos[0].fechaInicioCiclo!.getTime()).toBe(30 * DIA);
  });

  test("los meses se suman al final del ciclo vigente", async () => {
    const vigenteHasta = new Date(Date.now() + 10 * DIA);
    const { deps, pagos, extensiones, fechasMiembro } = crearDeps({ vigenteHasta });
    await registrarPago(deps, input({ meses: 2, lineas: [linea(50)] }));

    const esperado = new Date(vigenteHasta.getTime() + 60 * DIA);
    expect(extensiones).toEqual([esperado]);
    expect(pagos[0].fechaFinCiclo).toEqual(esperado);
    expect(fechasMiembro[0].fin).toEqual(esperado);
  });

  test("un mes con cada método (3 líneas que suman el total) comparte grupo de pago y ciclo", async () => {
    const { deps, pagos } = crearDeps();
    await registrarPago(
      deps,
      input({ meses: 3, lineas: [linea(25, "Pago Móvil"), linea(25, "Tarjeta"), linea(25, "Efectivo (USD)")] })
    );

    expect(pagos).toHaveLength(3);
    expect(new Set(pagos.map((p) => p.grupoPagoId)).size).toBe(1);
    expect(pagos[0].grupoPagoId).not.toBeNull();
    expect(new Set(pagos.map((p) => p.fechaFinCiclo!.getTime())).size).toBe(1);
    expect(pagos[0].fechaFinCiclo!.getTime() - pagos[0].fechaInicioCiclo!.getTime()).toBe(90 * DIA);
  });

  test("con más de un mes no se aceptan abonos: el pago debe cubrir el total", async () => {
    const { deps, pagos } = crearDeps();
    await expect(registrarPago(deps, input({ meses: 3, lineas: [linea(50)] }))).rejects.toBeInstanceOf(
      MesesRequierenPagoCompletoError
    );
    expect(pagos).toHaveLength(0);
  });

  test("la tolerancia de diferencia se aplica sobre el total (hasta $1)", async () => {
    const { deps, pagos } = crearDeps();
    await registrarPago(deps, input({ meses: 3, lineas: [linea(74.5)] }));
    expect(pagos).toHaveLength(1);
  });

  test("meses fuera de 1 a 6 o no enteros se rechazan", async () => {
    for (const meses of [0, 7, 1.5, -1]) {
      const { deps } = crearDeps();
      await expect(registrarPago(deps, input({ meses }))).rejects.toBeInstanceOf(MesesInvalidosError);
    }
  });

  test("con un abono pendiente en el ciclo abierto no se pueden sumar meses", async () => {
    const fin = new Date(Date.now() + 20 * DIA);
    const { deps, pagos } = crearDeps({
      vigenteHasta: fin,
      pagosDelMiembro: [{ monto: 10, fechaFinCiclo: fin, fechaInicioCiclo: new Date(Date.now() - 10 * DIA), anuladoEn: null }],
    });
    await expect(registrarPago(deps, input({ meses: 2, lineas: [linea(50)] }))).rejects.toBeInstanceOf(MesesNoDisponiblesError);
    expect(pagos).toHaveLength(0);
  });

  test("primer pago de un miembro nuevo con fecha de inscripción pasada: 3 meses cuentan desde esa fecha", async () => {
    const { deps, pagos } = crearDeps();
    const fecha = new Date(Date.now() - 5 * DIA);
    await registrarPago(deps, input({ meses: 3, lineas: [linea(75)], fechaPago: fecha, primerPagoDeInscripcion: true }));
    expect(pagos[0].fechaFinCiclo!.getTime() - fecha.getTime()).toBe(90 * DIA);
  });

  test("con fecha pasada y más de un mes el pago también debe cubrir el total", async () => {
    const { deps } = crearDeps();
    await expect(
      registrarPago(deps, input({ meses: 3, lineas: [linea(30)], fechaPago: new Date(Date.now() - 5 * DIA), primerPagoDeInscripcion: true }))
    ).rejects.toBeInstanceOf(MesesRequierenPagoCompletoError);
  });
});
