import { describe, expect, test } from "vitest";
import { fiarProducto, type FiarProductoDeps } from "./FiarProducto";
import { totalDeudas, conceptoDeudas, type DatosNuevaDeuda, type DeudaProducto } from "../entities/DeudaProducto";
import type { Producto } from "../entities/Producto";

function crearDeps(
  opciones: {
    permitido?: boolean;
    producto?: Partial<Producto> | null;
    miembro?: { sucursalId: string | null } | null;
  } = {}
) {
  const { permitido = true } = opciones;
  const producto: Producto | null =
    opciones.producto === null
      ? null
      : { id: "p1", organizacionId: "org", nombre: "Agua", descripcion: null, costoUSD: 1.5, fotoUrl: null, activo: true, ...opciones.producto };
  const miembro = opciones.miembro === null ? null : { id: "m1", sucursalId: "suc", ...opciones.miembro };
  const creadas: DatosNuevaDeuda[] = [];

  const deps = {
    deudas: {
      crear: async (datos: DatosNuevaDeuda) => {
        creadas.push(datos);
        return { id: "d1", estado: "PENDIENTE", ...datos } as unknown as DeudaProducto;
      },
    },
    productos: { buscarPorId: async () => producto },
    miembros: { buscarPorId: async () => miembro },
    sucursales: { buscarPorId: async () => ({ nombre: "Sede Norte" }) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as FiarProductoDeps;

  return { deps, creadas };
}

const base = { organizacionId: "org", miembroId: "m1", productoId: "p1", sucursalId: "suc", registradaPorId: "u1" };

describe("fiarProducto", () => {
  test("crea la deuda con nombre y precio copiados del producto", async () => {
    const { deps, creadas } = crearDeps();
    await fiarProducto(deps, { ...base, cantidad: 2 });

    expect(creadas).toEqual([
      {
        organizacionId: "org",
        sucursalId: "suc",
        miembroId: "m1",
        productoId: "p1",
        productoNombre: "Agua",
        cantidad: 2,
        precioUnitarioUSD: 1.5,
        registradaPorId: "u1",
      },
    ]);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(fiarProducto(deps, { ...base, cantidad: 1 })).rejects.toThrow(/permiso/);
  });

  test("rechaza producto inactivo o inexistente", async () => {
    await expect(fiarProducto(crearDeps({ producto: { activo: false } }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/inactivo/);
    await expect(fiarProducto(crearDeps({ producto: null }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/producto/);
  });

  test.each([0, -1, 1.5, Number.NaN])("rechaza la cantidad inválida %s", async (cantidad) => {
    const { deps } = crearDeps();
    await expect(fiarProducto(deps, { ...base, cantidad })).rejects.toThrow(/cantidad/);
  });

  test("rechaza un miembro inexistente", async () => {
    const { deps } = crearDeps({ miembro: null });
    await expect(fiarProducto(deps, { ...base, cantidad: 1 })).rejects.toThrow(/miembro/);
  });

  test("rechaza un miembro de otra sucursal y acepta uno multisede (sucursalId null)", async () => {
    await expect(fiarProducto(crearDeps({ miembro: { sucursalId: "otra" } }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/Sede Norte/);
    const { deps, creadas } = crearDeps({ miembro: { sucursalId: null } });
    await fiarProducto(deps, { ...base, cantidad: 1 });
    expect(creadas).toHaveLength(1);
  });
});

describe("helpers de DeudaProducto", () => {
  test("totalDeudas redondea a 2 decimales (3 × 0.10 = 0.30 exacto)", () => {
    expect(totalDeudas([{ precioUnitarioUSD: 0.1, cantidad: 3 }])).toBe(0.3);
    expect(totalDeudas([{ precioUnitarioUSD: 1.5, cantidad: 2 }, { precioUnitarioUSD: 2.25, cantidad: 1 }])).toBe(5.25);
    expect(totalDeudas([])).toBe(0);
  });

  test("conceptoDeudas lista nombres y agrega × solo si cantidad > 1", () => {
    expect(conceptoDeudas([{ productoNombre: "Agua", cantidad: 2 }, { productoNombre: "Gatorade", cantidad: 1 }])).toBe("Agua × 2, Gatorade");
  });
});
