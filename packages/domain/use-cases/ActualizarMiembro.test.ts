import { describe, expect, test } from "vitest";
import { actualizarMiembro } from "./ActualizarMiembro";
import type { CambiosMiembro } from "../entities/Miembro";

function crearDeps() {
  const cambiosGuardados: CambiosMiembro[] = [];
  const finesAjustados: { miembroId: string; fin: Date }[] = [];
  const deps = {
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: null, planId: "p1" }),
      actualizar: async (_org: string, _id: string, cambios: CambiosMiembro) => {
        cambiosGuardados.push(cambios);
        return { id: "m1" };
      },
    },
    planes: {},
    suscripciones: {
      ajustarFinMasReciente: async (miembroId: string, fin: Date) => {
        finesAjustados.push({ miembroId, fin });
      },
    },
    sucursales: {},
  } as unknown as Parameters<typeof actualizarMiembro>[0];
  return { deps, cambiosGuardados, finesAjustados };
}

const base = { organizacionId: "org", id: "m1", sucursalActivaId: "s1" };

describe("actualizarMiembro — ajuste manual de vencimiento", () => {
  test("cambiar la fecha de vencimiento apaga 'Ajustar fecha' y la sincroniza con la suscripción", async () => {
    const { deps, cambiosGuardados, finesAjustados } = crearDeps();
    const nueva = new Date("2026-11-15T00:00:00.000Z");
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: nueva } });
    expect(cambiosGuardados[0]).toEqual({ fechaVencimiento: nueva, ajustarFecha: false });
    expect(finesAjustados).toEqual([{ miembroId: "m1", fin: nueva }]);
  });

  test("sin cambio de fecha no toca la suscripción ni el aviso", async () => {
    const { deps, cambiosGuardados, finesAjustados } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { nombre: "Otro" } });
    expect(cambiosGuardados[0]).toEqual({ nombre: "Otro" });
    expect(finesAjustados).toEqual([]);
  });
});
