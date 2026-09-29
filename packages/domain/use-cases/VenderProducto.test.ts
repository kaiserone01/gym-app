import { describe, expect, test } from "vitest";
import { venderProducto, type VenderProductoDeps } from "./VenderProducto";
import type { Producto } from "../entities/Producto";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const producto = (id: string, nombre: string, costoUSD: number, extra: Partial<Producto> = {}): Producto => ({
  id,
  organizacionId: "org",
  nombre,
  descripcion: null,
  costoUSD,
  fotoUrl: null,
  activo: true,
  ...extra,
});

function crearDeps(opciones: { permitido?: boolean; turnoAbierto?: boolean; productos?: Producto[] } = {}) {
  const { permitido = true, turnoAbierto = true } = opciones;
  const productos = opciones.productos ?? [producto("p1", "Agua", 1.5), producto("p2", "Gatorade", 2.25)];
  const creados: DatosNuevoPago[] = [];

  const deps = {
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        creados.push(datos);
        return { id: `pago-${creados.length}`, ...datos } as unknown as Pago;
      },
    },
    productos: { buscarPorId: async (_org: string, id: string) => productos.find((p) => p.id === id) ?? null },
    turnos: { buscarAbiertoPorSucursal: async () => (turnoAbierto ? { id: "turno1" } : null) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as VenderProductoDeps;

  return { deps, creados };
}

const base = { organizacionId: "org", sucursalId: "suc", registradoPorId: "u1" };
const linea = (monto: number, tasaCambio: number | null = null) => ({
  monto,
  metodo: "Efectivo (USD)",
  metodoPagoId: "mp1",
  numeroOperacion: null,
  tasaCambio,
});

describe("venderProducto", () => {
  test("un solo producto: el Pago conserva producto y cantidad, sin miembro ni ciclo", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad: 2 }], lineas: [linea(3)] });

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

  test("varios productos: el total suma todos y el concepto los lista (sin producto ni cantidad únicos)", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, {
      ...base,
      items: [
        { productoId: "p1", cantidad: 2 },
        { productoId: "p2", cantidad: 1 },
      ],
      lineas: [linea(5.25)],
    });

    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({ monto: 5.25, productoId: null, productoNombre: "Agua × 2, Gatorade", cantidad: null });
  });

  test("el mismo producto repetido en la lista se suma como una sola línea del carrito", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, {
      ...base,
      items: [
        { productoId: "p1", cantidad: 1 },
        { productoId: "p1", cantidad: 2 },
      ],
      lineas: [linea(4.5)],
    });

    expect(creados[0]).toMatchObject({ productoId: "p1", productoNombre: "Agua", cantidad: 3 });
  });

  test("pago combinado comparte grupoPagoId y calcula montoBs por línea", async () => {
    const { deps, creados } = crearDeps();
    await venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad: 2 }], lineas: [linea(1), linea(2, 50)] });

    expect(creados).toHaveLength(2);
    expect(creados[0].grupoPagoId).toBeTruthy();
    expect(creados[0].grupoPagoId).toBe(creados[1].grupoPagoId);
    expect(creados[1].montoBs).toBe(100);
  });

  test("total con decimales flotantes: 3 × 0.10 se cobra como 0.30", async () => {
    const { deps } = crearDeps({ productos: [producto("p3", "Chicle", 0.1)] });
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "p3", cantidad: 3 }], lineas: [linea(0.3)] })).resolves.toHaveLength(1);
  });

  test("rechaza si la suma de las líneas no cubre el total del carrito", async () => {
    const { deps, creados } = crearDeps();
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad: 2 }], lineas: [linea(2)] })).rejects.toThrow(/no coincide/);
    expect(creados).toHaveLength(0);
  });

  test("rechaza un carrito vacío", async () => {
    const { deps } = crearDeps();
    await expect(venderProducto(deps, { ...base, items: [], lineas: [linea(1)] })).rejects.toThrow(/al menos un producto/);
  });

  test("rechaza sin turno abierto", async () => {
    const { deps } = crearDeps({ turnoAbierto: false });
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad: 1 }], lineas: [linea(1.5)] })).rejects.toThrow(/turno/);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad: 1 }], lineas: [linea(1.5)] })).rejects.toThrow(/permiso/);
  });

  test.each([0, -1, 1.5, Number.NaN])("rechaza la cantidad inválida %s", async (cantidad) => {
    const { deps } = crearDeps();
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "p1", cantidad }], lineas: [linea(1.5)] })).rejects.toThrow(/cantidad/);
  });

  test("rechaza si algún producto del carrito está inactivo o no existe", async () => {
    const inactivo = crearDeps({ productos: [producto("p1", "Agua", 1.5), producto("p2", "Gatorade", 2.25, { activo: false })] });
    await expect(
      venderProducto(inactivo.deps, {
        ...base,
        items: [
          { productoId: "p1", cantidad: 1 },
          { productoId: "p2", cantidad: 1 },
        ],
        lineas: [linea(3.75)],
      })
    ).rejects.toThrow(/inactivo/);

    const { deps } = crearDeps();
    await expect(venderProducto(deps, { ...base, items: [{ productoId: "nope", cantidad: 1 }], lineas: [linea(1)] })).rejects.toThrow(/producto/);
  });
});
