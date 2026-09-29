import { describe, expect, test } from "vitest";
import { anularDeuda } from "./AnularDeuda";

function crearDeps(opciones: { permitido?: boolean; filasAfectadas?: number } = {}) {
  const { permitido = true, filasAfectadas = 1 } = opciones;
  const llamadas: { modulo: string; accion: string }[] = [];
  const deps = {
    deudas: { anular: async () => filasAfectadas },
    autorizacion: {
      tienePermiso: async (_u: string, modulo: string, accion: string) => {
        llamadas.push({ modulo, accion });
        return permitido;
      },
    },
  };
  return { deps: deps as unknown as Parameters<typeof anularDeuda>[0], llamadas };
}

const input = { organizacionId: "org", id: "d1", anuladaPorId: "u1" };

describe("anularDeuda", () => {
  test("anula una deuda pendiente exigiendo PAGOS/ELIMINAR", async () => {
    const { deps, llamadas } = crearDeps();
    await expect(anularDeuda(deps, input)).resolves.toBeUndefined();
    expect(llamadas).toEqual([{ modulo: "PAGOS", accion: "ELIMINAR" }]);
  });

  test("rechaza sin permiso", async () => {
    await expect(anularDeuda(crearDeps({ permitido: false }).deps, input)).rejects.toThrow(/permiso/);
  });

  test("rechaza si ya no está pendiente (0 filas afectadas)", async () => {
    await expect(anularDeuda(crearDeps({ filasAfectadas: 0 }).deps, input)).rejects.toThrow(/pendiente/);
  });
});
