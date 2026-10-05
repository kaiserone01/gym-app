import { describe, expect, test } from "vitest";
import { cobrarDeudasMiembro, seleccionarDeudas, DeudasYaCobradasError } from "./CobrarDeudasMiembro";
import { MontoLineasNoCubreObjetivoError } from "../entities/Pago";
import type { DeudaProducto } from "../entities/DeudaProducto";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const deuda = (id: string, productoNombre: string, cantidad: number, precioUnitarioUSD: number): DeudaProducto => ({
  id,
  organizacionId: "org",
  sucursalId: "s1",
  miembroId: "m1",
  productoId: "p-" + id,
  productoNombre,
  cantidad,
  precioUnitarioUSD,
  estado: "PENDIENTE",
  registradaPorId: "u0",
  creadaEn: new Date("2026-10-01"),
  cobradaEn: null,
  grupoPagoId: null,
});

// Agua $1.20 + Barra $2.50
const AGUA = deuda("d1", "Agua mineral 1L", 1, 1.2);
const BARRA = deuda("d2", "Barra de proteína vainilla", 1, 2.5);

function crearDeps() {
  const marcadas: string[][] = [];
  const pagos: DatosNuevoPago[] = [];
  const deps = {
    deudas: {
      listarPendientesPorMiembro: async () => [AGUA, BARRA],
      marcarCobradas: async (ids: string[]) => {
        marcadas.push(ids);
        return ids.length;
      },
    },
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagos.push(datos);
        return datos as unknown as Pago;
      },
    },
    turnos: { buscarAbiertoPorSucursal: async () => ({ id: "t1" }) },
    autorizacion: { tienePermiso: async () => true },
  } as unknown as Parameters<typeof cobrarDeudasMiembro>[0];
  return { deps, marcadas, pagos };
}

const linea = (monto: number) => ({ monto, metodo: "Efectivo USD", metodoPagoId: "mp1", numeroOperacion: null, tasaCambio: null });
const base = { organizacionId: "org", miembroId: "m1", sucursalId: "s1", registradoPorId: "u1" };

describe("cobrar solo algunos productos marcados", () => {
  test("cobra únicamente la barra: marca solo esa deuda y el pago es de $2.50; el agua queda pendiente", async () => {
    const { deps, marcadas, pagos } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(2.5)], deudaIds: ["d2"] });
    expect(marcadas).toEqual([["d2"]]);
    expect(pagos).toHaveLength(1);
    expect(pagos[0].monto).toBe(2.5);
    expect(pagos[0].productoNombre).toContain("Barra de proteína vainilla");
  });

  test("el monto debe coincidir con lo marcado, no con todo lo pendiente", async () => {
    const { deps, marcadas } = crearDeps();
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(3.7)], deudaIds: ["d2"] })).rejects.toBeInstanceOf(
      MontoLineasNoCubreObjetivoError
    );
    expect(marcadas).toEqual([]);
  });

  test("sin deudaIds cobra todas las pendientes (comportamiento de siempre)", async () => {
    const { deps, marcadas } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(3.7)] });
    expect(marcadas).toEqual([["d1", "d2"]]);
  });

  test("un producto que ya no está pendiente invalida el cobro", async () => {
    const { deps, marcadas } = crearDeps();
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(2.5)], deudaIds: ["d2", "d-otra-caja"] })).rejects.toBeInstanceOf(
      DeudasYaCobradasError
    );
    expect(marcadas).toEqual([]);
  });
});

describe("seleccionarDeudas", () => {
  test("filtra por ids, y sin ids devuelve todas", () => {
    expect(seleccionarDeudas([AGUA, BARRA], ["d1"])).toEqual([AGUA]);
    expect(seleccionarDeudas([AGUA, BARRA])).toEqual([AGUA, BARRA]);
    expect(seleccionarDeudas([AGUA, BARRA], [])).toEqual([]);
  });
});
