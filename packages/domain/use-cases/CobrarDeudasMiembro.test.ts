import { describe, expect, test } from "vitest";
import { cobrarDeudasMiembro, type CobrarDeudasMiembroDeps } from "./CobrarDeudasMiembro";
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

function crearDeps(
  opciones: { permitido?: boolean; turnoAbierto?: boolean; deudas?: DeudaProducto[]; cobradasPorLaBase?: number } = {}
) {
  const { permitido = true, turnoAbierto = true } = opciones;
  const deudas = opciones.deudas ?? [deuda("d1", "Agua", 2, 1.5), deuda("d2", "Gatorade", 1, 2.25)];
  const pagosCreados: DatosNuevoPago[] = [];
  const marcadas: { ids: string[]; grupoPagoId: string }[] = [];

  const deps = {
    deudas: {
      listarPendientesPorMiembro: async () => deudas,
      marcarCobradas: async (ids: string[], _por: string, _en: Date, grupoPagoId: string) => {
        marcadas.push({ ids, grupoPagoId });
        return opciones.cobradasPorLaBase ?? ids.length;
      },
    },
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagosCreados.push(datos);
        return { id: `pago-${pagosCreados.length}`, ...datos } as unknown as Pago;
      },
    },
    turnos: { buscarAbiertoPorSucursal: async () => (turnoAbierto ? { id: "turno1" } : null) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as CobrarDeudasMiembroDeps;

  return { deps, pagosCreados, marcadas };
}

const base = { organizacionId: "org", miembroId: "m1", sucursalId: "suc", registradoPorId: "u1" };
const linea = (monto: number, tasaCambio: number | null = null) => ({
  monto,
  metodo: "Efectivo (USD)",
  metodoPagoId: "mp1",
  numeroOperacion: null,
  tasaCambio,
});

describe("cobrarDeudasMiembro", () => {
  test("cobra el total: pagos a nombre del miembro con el concepto y deudas marcadas", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] });

    expect(pagosCreados).toHaveLength(1);
    expect(pagosCreados[0]).toMatchObject({
      miembroId: "m1",
      turnoId: "turno1",
      monto: 5.25,
      productoId: null,
      productoNombre: "Agua × 2, Gatorade",
      cantidad: null,
      fechaInicioCiclo: null,
      fechaFinCiclo: null,
    });
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].ids).toEqual(["d1", "d2"]);
    expect(pagosCreados[0].grupoPagoId).toBe(marcadas[0].grupoPagoId);
  });

  test("pago combinado: mismo grupoPagoId en todas las líneas y montoBs por línea", async () => {
    const { deps, pagosCreados } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(1.25), linea(4, 50)] });

    expect(pagosCreados).toHaveLength(2);
    expect(pagosCreados[0].grupoPagoId).toBe(pagosCreados[1].grupoPagoId);
    expect(pagosCreados[1].montoBs).toBe(200);
  });

  test("rechaza si la suma de las líneas no es el total que el servidor calcula", async () => {
    const { deps, pagosCreados } = crearDeps();
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5)] })).rejects.toThrow(/no coincide/);
    expect(pagosCreados).toHaveLength(0);
  });

  test("total con decimales flotantes: 3 × 0.10 se cobra como 0.30", async () => {
    const { deps } = crearDeps({ deudas: [deuda("d1", "Chicle", 3, 0.1)] });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(0.3)] })).resolves.toHaveLength(1);
  });

  test("rechaza sin deudas pendientes", async () => {
    const { deps } = crearDeps({ deudas: [] });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(1)] })).rejects.toThrow(/pendientes/);
  });

  test("rechaza sin turno abierto y sin escribir nada", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps({ turnoAbierto: false });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/turno/);
    expect(pagosCreados).toHaveLength(0);
    expect(marcadas).toHaveLength(0);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/permiso/);
  });

  test("si otra caja cobró a la vez (menos filas actualizadas), falla sin crear pagos", async () => {
    const { deps, pagosCreados } = crearDeps({ cobradasPorLaBase: 1 });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/ya fueron cobradas/);
    expect(pagosCreados).toHaveLength(0);
  });
});
