import { describe, expect, test } from "vitest";
import { listarDeudasPendientes } from "./ListarDeudasPendientes";
import type { DeudaProducto } from "../entities/DeudaProducto";

const deuda = (id: string, miembroId: string, miembroNombre: string, cantidad: number, precio: number): DeudaProducto => ({
  id,
  organizacionId: "org",
  sucursalId: "suc",
  miembroId,
  miembroNombre,
  productoId: null,
  productoNombre: "Agua",
  cantidad,
  precioUnitarioUSD: precio,
  estado: "PENDIENTE",
  registradaPorId: "u",
  creadaEn: new Date(),
  cobradaEn: null,
  grupoPagoId: null,
});

describe("listarDeudasPendientes", () => {
  test("agrupa por miembro con su total y ordena por nombre", async () => {
    const deps = {
      deudas: {
        listarPendientesPorOrganizacion: async () => [
          deuda("d1", "m2", "Zoe", 1, 1.5),
          deuda("d2", "m1", "Ana", 2, 1.5),
          deuda("d3", "m2", "Zoe", 1, 2),
        ],
      },
    } as unknown as Parameters<typeof listarDeudasPendientes>[0];

    const grupos = await listarDeudasPendientes(deps, "org", "suc");

    expect(grupos.map((g) => [g.miembroNombre, g.totalUSD, g.deudas.length])).toEqual([
      ["Ana", 3, 1],
      ["Zoe", 3.5, 2],
    ]);
  });

  test("consulta solo la sucursal indicada", async () => {
    const sucursales: string[] = [];
    const deps = {
      deudas: {
        listarPendientesPorOrganizacion: async (_org: string, sucursalId: string) => {
          sucursales.push(sucursalId);
          return [];
        },
      },
    } as unknown as Parameters<typeof listarDeudasPendientes>[0];
    await listarDeudasPendientes(deps, "org", "suc-activa");
    expect(sucursales).toEqual(["suc-activa"]);
  });

  test("sin deudas devuelve lista vacía", async () => {
    const deps = { deudas: { listarPendientesPorOrganizacion: async () => [] } } as unknown as Parameters<typeof listarDeudasPendientes>[0];
    await expect(listarDeudasPendientes(deps, "org", "suc")).resolves.toEqual([]);
  });
});
