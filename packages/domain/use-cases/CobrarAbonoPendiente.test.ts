import { describe, expect, test } from "vitest";
import { cobrarAbonoPendiente, MontoNoCoincideConLoPendienteError, SinAbonoPendienteError } from "./CobrarAbonoPendiente";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const DIA = 24 * 60 * 60 * 1000;
const inicio = new Date(Date.now() - 2 * DIA);
const fin = new Date(inicio.getTime() + 30 * DIA);

function crearDeps(opciones: { pagadoPrevio?: number } = {}) {
  const { pagadoPrevio = 10 } = opciones;
  const previos = pagadoPrevio > 0
    ? [{ id: "p0", miembroId: "m1", monto: pagadoPrevio, anuladoEn: null, fechaInicioCiclo: inicio, fechaFinCiclo: fin } as Pago]
    : [];
  const creados: DatosNuevoPago[] = [];
  const deps = {
    pagos: {
      listarPorMiembro: async () => previos,
      crear: async (datos: DatosNuevoPago) => {
        creados.push(datos);
        return datos as unknown as Pago;
      },
    },
    suscripciones: {
      buscarActivaVigentePorMiembroYPlan: async () => ({ id: "s1", inicio, fin }),
      extenderFin: async () => undefined,
      actualizarFechaLimiteAbono: async () => undefined,
    },
    miembros: {
      buscarPorId: async () => ({ id: "m1", nombre: "Andrea", sucursalId: "s1", planId: "plan1", precioPlan: 22, saldoAFavorUSD: 0, ajustarFecha: false, genero: null }),
      actualizar: async () => null,
      actualizarFechasPago: async () => undefined,
    },
    planes: { buscarPorId: async () => ({ id: "plan1", nombre: "Corporativo", activo: true, precioUSD: 22, diasCiclo: 30, frecuencia: "MENSUAL", permitePagoParcial: true }) },
    turnos: { buscarAbiertoPorSucursal: async () => ({ id: "turno1" }) },
    sucursales: {},
    autorizacion: { tienePermiso: async () => true },
    reglasAbono: { buscarPorOrganizacionYFrecuencia: async () => null },
    deudas: { listarPendientesPorMiembro: async () => [] },
  } as unknown as Parameters<typeof cobrarAbonoPendiente>[0];
  return { deps, creados };
}

const linea = (monto: number) => ({ monto, metodo: "Pago Móvil", metodoPagoId: "mp1", numeroOperacion: "1234", tasaCambio: null });
const input = (monto: number) => ({
  organizacionId: "org",
  miembroId: "m1",
  lineas: [linea(monto)],
  sucursalId: "s1",
  registradoPorId: "u1",
  rolUsuario: "SOCIO" as const,
});

describe("cobrarAbonoPendiente", () => {
  test("cobra el saldo exacto ($12 de un plan de $22 con $10 abonados) y registra el pago en el turno", async () => {
    const { deps, creados } = crearDeps();
    await cobrarAbonoPendiente(deps, input(12));
    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({ monto: 12, turnoId: "turno1", miembroId: "m1" });
  });

  test("un monto distinto al saldo se rechaza", async () => {
    const { deps, creados } = crearDeps();
    await expect(cobrarAbonoPendiente(deps, input(5))).rejects.toBeInstanceOf(MontoNoCoincideConLoPendienteError);
    expect(creados).toEqual([]);
  });

  test("sin saldo pendiente → SinAbonoPendienteError", async () => {
    const { deps } = crearDeps({ pagadoPrevio: 0 });
    await expect(cobrarAbonoPendiente(deps, input(22))).rejects.toBeInstanceOf(SinAbonoPendienteError);
  });
});
