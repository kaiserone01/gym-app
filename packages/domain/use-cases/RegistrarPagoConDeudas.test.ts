import { describe, expect, test } from "vitest";
import { registrarPagoConDeudas, type RegistrarPagoConDeudasDeps } from "./RegistrarPagoConDeudas";
import type { DeudaProducto } from "../entities/DeudaProducto";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const deuda = (id: string, productoNombre: string, cantidad: number, precioUnitarioUSD: number): DeudaProducto => ({
  id,
  organizacionId: "org",
  sucursalId: "suc",
  miembroId: "m1",
  productoId: "p-" + id,
  productoNombre,
  cantidad,
  precioUnitarioUSD,
  estado: "PENDIENTE",
  registradaPorId: "u0",
  creadaEn: new Date("2026-09-01"),
  cobradaEn: null,
  grupoPagoId: null,
});

const DEUDAS = [deuda("d1", "Agua", 2, 1.5), deuda("d2", "Gatorade", 1, 2.25)]; // $5.25

function crearDeps(opciones: { deudas?: DeudaProducto[]; turnoAbierto?: boolean } = {}) {
  const deudas = opciones.deudas ?? DEUDAS;
  const { turnoAbierto = true } = opciones;
  const pagosCreados: DatosNuevoPago[] = [];
  const marcadas: string[][] = [];
  const consultas: { sucursalId: string }[] = [];

  const deps = {
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagosCreados.push(datos);
        return { id: `pago-${pagosCreados.length}`, ...datos } as unknown as Pago;
      },
      listarPorMiembro: async () => [],
    },
    deudas: {
      listarPendientesPorMiembro: async (_org: string, _miembro: string, sucursalId: string) => {
        consultas.push({ sucursalId });
        return deudas;
      },
      marcarCobradas: async (ids: string[]) => {
        marcadas.push(ids);
        return ids.length;
      },
    },
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: "suc", planId: "plan1", precioPlan: 30, saldoAFavorUSD: 0 }),
      actualizar: async () => null,
      actualizarFechasPago: async () => undefined,
    },
    planes: { buscarPorId: async () => ({ id: "plan1", activo: true, precioUSD: 30, diasCiclo: 30, frecuencia: "MENSUAL", permitePagoParcial: true }) },
    suscripciones: {
      buscarActivaVigentePorMiembroYPlan: async () => null,
      crear: async () => undefined,
      extenderFin: async () => undefined,
      actualizarFechaLimiteAbono: async () => undefined,
    },
    turnos: { buscarAbiertoPorSucursal: async () => (turnoAbierto ? { id: "turno1" } : null) },
    sucursales: { buscarPorId: async () => ({ nombre: "Sede" }) },
    reglasAbono: { buscarPorOrganizacionYFrecuencia: async () => null },
    autorizacion: { tienePermiso: async () => true },
  } as unknown as RegistrarPagoConDeudasDeps;

  return { deps, pagosCreados, marcadas, consultas };
}

const linea = (monto: number, tasaCambio: number | null = null) => ({
  monto,
  metodo: "Efectivo (USD)",
  metodoPagoId: "mp1",
  numeroOperacion: null,
  tasaCambio,
});

const base = {
  organizacionId: "org",
  miembroId: "m1",
  planId: "plan1",
  sucursalId: "suc",
  registradoPorId: "u1",
  rolUsuario: "RECEPCION" as const,
};

describe("registrarPagoConDeudas", () => {
  test("incluyendo deudas: cobra los productos primero y la membresía con el resto", async () => {
    const { deps, pagosCreados, marcadas, consultas } = crearDeps();
    const pagos = await registrarPagoConDeudas(deps, { ...base, lineas: [linea(35.25)], incluirDeudas: true });

    // Toda consulta de deudas se limita a la sucursal de la caja.
    expect(consultas.length).toBeGreaterThan(0);
    expect(consultas.every((c) => c.sucursalId === "suc")).toBe(true);
    expect(marcadas).toEqual([["d1", "d2"]]);
    expect(pagosCreados).toHaveLength(2);
    expect(pagosCreados[0]).toMatchObject({ miembroId: "m1", monto: 5.25, productoNombre: "Agua × 2, Gatorade", fechaFinCiclo: null });
    expect(pagosCreados[1]).toMatchObject({ miembroId: "m1", monto: 30, productoNombre: undefined });
    expect(pagosCreados[1].fechaFinCiclo).toBeInstanceOf(Date);
    // Lo que se devuelve es el pago de la membresía (el que usa la pantalla para mostrar el vencimiento).
    expect(pagos).toHaveLength(1);
    expect(pagos[0].monto).toBe(30);
  });

  test("pago combinado: la deuda se descuenta de las líneas en orden y la membresía recibe el resto", async () => {
    const { deps, pagosCreados } = crearDeps();
    await registrarPagoConDeudas(deps, { ...base, lineas: [linea(8.25), linea(27, 50)], incluirDeudas: true });

    expect(pagosCreados.map((p) => [p.monto, p.tasaCambio, p.productoNombre ?? null])).toEqual([
      [5.25, null, "Agua × 2, Gatorade"],
      [3, null, null],
      [27, 50, null],
    ]);
  });

  test("sin incluir deudas: solo registra la membresía y no toca las deudas", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps();
    await registrarPagoConDeudas(deps, { ...base, lineas: [linea(30)], incluirDeudas: false });

    expect(marcadas).toEqual([]);
    expect(pagosCreados).toHaveLength(1);
    expect(pagosCreados[0].monto).toBe(30);
  });

  test("si el miembro ya no tiene deudas pendientes, registra solo la membresía", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps({ deudas: [] });
    await registrarPagoConDeudas(deps, { ...base, lineas: [linea(30)], incluirDeudas: true });

    expect(marcadas).toEqual([]);
    expect(pagosCreados).toHaveLength(1);
  });

  test("rechaza (sin escribir nada) si el monto no alcanza para cubrir la deuda y la membresía", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps();
    await expect(registrarPagoConDeudas(deps, { ...base, lineas: [linea(5.25)], incluirDeudas: true })).rejects.toThrow(/deuda/);
    await expect(registrarPagoConDeudas(deps, { ...base, lineas: [linea(4)], incluirDeudas: true })).rejects.toThrow(/deuda/);
    expect(pagosCreados).toHaveLength(0);
    expect(marcadas).toEqual([]);
  });

  test("incluyendo deudas exige turno abierto antes de escribir nada", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps({ turnoAbierto: false });
    await expect(registrarPagoConDeudas(deps, { ...base, lineas: [linea(35.25)], incluirDeudas: true })).rejects.toThrow(/turno/);
    expect(pagosCreados).toHaveLength(0);
    expect(marcadas).toEqual([]);
  });
});
