import { describe, expect, test } from "vitest";
import { actualizarMiembro, AjusteFechaNoDisponibleError } from "./ActualizarMiembro";
import type { CambiosMiembro } from "../entities/Miembro";

function crearDeps(ajustarFecha = true) {
  const cambiosGuardados: CambiosMiembro[] = [];
  const ciclos: { inicio: Date; fin: Date }[] = [];
  const deps = {
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: null, planId: "p1", ajustarFecha }),
      actualizar: async (_org: string, _id: string, cambios: CambiosMiembro) => {
        cambiosGuardados.push(cambios);
        return { id: "m1" };
      },
    },
    planes: { buscarPorId: async () => ({ diasCiclo: 30 }) },
    suscripciones: {
      ajustarCicloMasReciente: async (_id: string, inicio: Date, fin: Date) => {
        ciclos.push({ inicio, fin });
        return true;
      },
    },
    sucursales: {},
  } as unknown as Parameters<typeof actualizarMiembro>[0];
  return { deps, cambiosGuardados, ciclos };
}

const base = { organizacionId: "org", id: "m1", sucursalActivaId: "s1" };
const DIA = 24 * 60 * 60 * 1000;

describe("actualizarMiembro — ajuste manual del vencimiento", () => {
  test("con el aviso activo: guarda la fecha, apaga el aviso y sincroniza la suscripción (fin y inicio = fin - días del plan)", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps();
    const nueva = new Date("2026-11-15T00:00:00.000Z");
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: nueva } });
    expect(cambiosGuardados[0]).toEqual({ fechaVencimiento: nueva, ajustarFecha: false });
    expect(ciclos).toEqual([{ inicio: new Date(nueva.getTime() - 30 * DIA), fin: nueva }]);
  });

  test("sin el aviso activo no se puede cambiar la fecha de vencimiento", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await expect(
      actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: new Date("2026-11-15T00:00:00.000Z") } })
    ).rejects.toBeInstanceOf(AjusteFechaNoDisponibleError);
    expect(cambiosGuardados).toEqual([]);
  });

  test("sin cambio de fecha no toca la suscripción ni el aviso", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { nombre: "Otro" } });
    expect(cambiosGuardados[0]).toEqual({ nombre: "Otro" });
    expect(ciclos).toEqual([]);
  });
});
