import { describe, expect, test } from "vitest";
import { venderProducto, type VenderProductoDeps } from "./VenderProducto";
import type { Producto } from "../entities/Producto";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

function crearDeps(opciones: { permitido?: boolean; turnoAbierto?: boolean; producto?: Partial<Producto> | null } = {}) {
  const { permitido = true, turnoAbierto = true } = opciones;
  const producto: Producto | null =
    opciones.producto === null
      ? null
      : { id: "p1", organizacionId: "org", nombre: "Agua", descripcion: null, costoUSD: 1.5, fotoUrl: null, activo: true, ...opciones.producto };
  const creados: DatosNuevoPago[] = [];

  const deps = {
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        creados.push(datos);
        return { id: `pago-${creados.length}`, ...datos } as unknown as Pago;
      },
    },
    productos: { buscarPorId: async () => producto },
    turnos: { buscarAbiertoPorSucursal: async () => (turnoAbierto ? { id: "turno1" } : null) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as VenderProductoDeps;

  return { deps, creados };
}

const base = { organizacionId: "org", productoId: "p1", sucursalId: "suc", registradoPorId: "u1" };
const linea = (monto: number, tasaCambio: number | null = null) => ({
  monto,
  metodo: "Efectivo (USD)",
  metodoPagoId: null,
  numeroOperacion: null,
  tasaCambio,
});

describe("venderProducto", () => {
  test("crea un Pago sin miembro ni ciclo con snapshot del producto", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, { ...base, cantidad: 2, lineas: [linea(3)] });

    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({
      miembroId: null,
      turnoId: "turno1",
      productoId: "p1",
      productoNombre: "Agua",
      cantidad: 2,
      fechaInicioCiclo: null,
      fechaFinCiclo: null,
      grupoPagoId: null,
    });
  });

  test("pago combinado comparte grupoPagoId y calcula montoBs por línea", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, { ...base, cantidad: 2, lineas: [linea(1), linea(2, 50)] });

    expect(creados).toHaveLength(2);
    expect(creados[0].grupoPagoId).toBeTruthy();
    expect(creados[0].grupoPagoId).toBe(creados[1].grupoPagoId);
    expect(creados[1].montoBs).toBe(100);
  });

  test("rechaza si la suma de las líneas no cubre costo × cantidad", async () => {
    const { deps } = crearDeps();
    await expect(venderProducto(deps, { ...base, cantidad: 2, lineas: [linea(2)] })).rejects.toThrow(/no coincide/);
  });

  test("rechaza sin turno abierto", async () => {
    const { deps } = crearDeps({ turnoAbierto: false });
    await expect(venderProducto(deps, { ...base, cantidad: 1, lineas: [linea(1.5)] })).rejects.toThrow(/turno/);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(venderProducto(deps, { ...base, cantidad: 1, lineas: [linea(1.5)] })).rejects.toThrow(/permiso/);
  });

  test("rechaza cantidad inválida y producto inactivo", async () => {
    const { deps } = crearDeps();
    await expect(venderProducto(deps, { ...base, cantidad: 0, lineas: [linea(1.5)] })).rejects.toThrow(/cantidad/);
    const inactivo = crearDeps({ producto: { activo: false } });
    await expect(venderProducto(inactivo.deps, { ...base, cantidad: 1, lineas: [linea(1.5)] })).rejects.toThrow(/inactivo/);
  });
});
