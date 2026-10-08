import { describe, expect, test } from "vitest";
import { actualizarMiembro, AjusteFechaNoDisponibleError, CedulaDuplicadaError } from "./ActualizarMiembro";
import type { CambiosMiembro } from "../entities/Miembro";

function crearDeps(porRegularizar = true, cedulaOcupadaPor: string | null = null) {
  const cambiosGuardados: CambiosMiembro[] = [];
  const ciclos: { inicio: Date; fin: Date }[] = [];
  const deps = {
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: null, planId: "p1", cedula: "111", porRegularizar, genero: null }),
      buscarPorOrganizacionYCedula: async () => (cedulaOcupadaPor ? { id: cedulaOcupadaPor } : null),
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
    expect(cambiosGuardados[0]).toEqual({ fechaVencimiento: nueva, porRegularizar: false });
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

describe("actualizarMiembro — cédula", () => {
  test("permite cambiar la cédula si nadie más la tiene", async () => {
    const { deps, cambiosGuardados } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { cedula: "222" } });
    expect(cambiosGuardados[0]).toEqual({ cedula: "222" });
  });

  test("rechaza una cédula que ya tiene otro miembro", async () => {
    const { deps, cambiosGuardados } = crearDeps(true, "otro");
    await expect(actualizarMiembro(deps, { ...base, cambios: { cedula: "222" } })).rejects.toBeInstanceOf(CedulaDuplicadaError);
    expect(cambiosGuardados).toEqual([]);
  });

  test("guardar con la misma cédula no consulta duplicados", async () => {
    const { deps, cambiosGuardados } = crearDeps(true, "otro");
    await actualizarMiembro(deps, { ...base, cambios: { cedula: "111" } });
    expect(cambiosGuardados).toHaveLength(1);
  });
});

describe("actualizarMiembro — género y fecha de nacimiento", () => {
  test("pasa genero y fechaNacimiento null al repositorio (vaciar un valor no se ignora)", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await actualizarMiembro(deps, { ...base, cambios: { genero: null, fechaNacimiento: null } });
    expect(cambiosGuardados[0]).toEqual({ genero: null, fechaNacimiento: null });
  });

  test("pasa un género y una fecha de nacimiento definidos", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    const nacimiento = new Date(1990, 9, 8);
    await actualizarMiembro(deps, { ...base, cambios: { genero: "FEMENINO", fechaNacimiento: nacimiento } });
    expect(cambiosGuardados[0]).toEqual({ genero: "FEMENINO", fechaNacimiento: nacimiento });
  });
});
