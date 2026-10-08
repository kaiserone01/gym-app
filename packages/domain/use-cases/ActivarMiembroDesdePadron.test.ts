import { describe, expect, test } from "vitest";
import { activarMiembroPorCedula, type ActivarMiembroDeps } from "./ActivarMiembroDesdePadron";
import type { MiembroReferencia } from "../entities/MiembroReferencia";
import type { Miembro, DatosNuevoMiembro } from "../entities/Miembro";

const DIA = 24 * 60 * 60 * 1000;
const input = { organizacionId: "org", sucursalId: "principal", cedula: "123" };

const referenciaBase: MiembroReferencia = {
  id: "r1", organizacionId: "org", sucursalId: "principal", cedula: "123", numeroFila: 5,
  nombre: "Ana Pérez", status: "ACTIVO", fNacimiento: null, celular: "0414", fVenc: "2026-10-01",
  fechaPago: null, plan: "30", fechaVencimiento: new Date("2026-10-01T00:00:00Z"),
  fechaUltimoPago: new Date("2026-09-01T00:00:00Z"), fechaNacimiento: null,
  planNombre: "Mensual con entrenador", precioPlanUSD: 30, archivoOrigen: "x.xlsm", importadoAt: new Date(),
  camposEditados: [], editadoAt: null, editadoPor: null,
};

function crearDeps(opciones: { existente?: Partial<Miembro> | null; referencia?: Partial<MiembroReferencia> | null; planes?: { id: string; nombre: string; diasCiclo: number; precioUSD: number }[] } = {}) {
  const creados: DatosNuevoMiembro[] = [];
  const suscripciones: { miembroId: string; planId: string; inicio: Date; fin: Date; fechaLimiteAbono: Date | null }[] = [];
  const deps = {
    miembros: {
      buscarPorOrganizacionYCedula: async () => (opciones.existente ? (opciones.existente as Miembro) : null),
      crear: async (datos: DatosNuevoMiembro) => {
        creados.push(datos);
        return { id: "nuevo", ...datos } as unknown as Miembro;
      },
    },
    referencias: {
      buscarPorCedula: async () => (opciones.referencia === null ? null : { ...referenciaBase, ...opciones.referencia }),
    },
    planes: { listarPorOrganizacion: async () => opciones.planes ?? [{ id: "p30", nombre: "Mensual con entrenador", diasCiclo: 30, precioUSD: 30 }] },
    suscripciones: {
      crear: async (datos: (typeof suscripciones)[number]) => {
        suscripciones.push(datos);
        return datos;
      },
    },
  } as unknown as ActivarMiembroDeps;
  return { deps, creados, suscripciones };
}

describe("activarMiembroPorCedula", () => {
  test("si ya es miembro lo devuelve sin crear nada", async () => {
    const { deps, creados } = crearDeps({ existente: { id: "m1" } });
    expect((await activarMiembroPorCedula(deps, input))?.id).toBe("m1");
    expect(creados).toEqual([]);
  });

  test("si no está en el padrón devuelve null", async () => {
    const { deps, creados } = crearDeps({ referencia: null });
    expect(await activarMiembroPorCedula(deps, input)).toBeNull();
    expect(creados).toEqual([]);
  });

  test("otra sede no activa", async () => {
    const { deps, creados } = crearDeps();
    expect(await activarMiembroPorCedula(deps, { ...input, sucursalId: "otra" })).toBeNull();
    expect(creados).toEqual([]);
  });

  test("crea el miembro por regularizar con los datos del padrón y su suscripción", async () => {
    const { deps, creados, suscripciones } = crearDeps();
    const miembro = await activarMiembroPorCedula(deps, input);
    expect(miembro?.id).toBe("nuevo");
    expect(creados[0]).toMatchObject({
      organizacionId: "org", sucursalId: "principal", nombre: "Ana Pérez", cedula: "123", celular: "0414",
      planId: "p30", precioPlan: 30, porRegularizar: true,
    });
    expect(creados[0].fechaVencimiento).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(creados[0].fechaUltimoPago).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(suscripciones).toEqual([
      {
        miembroId: "nuevo", planId: "p30",
        inicio: new Date(new Date("2026-10-01T00:00:00Z").getTime() - 30 * DIA),
        fin: new Date("2026-10-01T00:00:00Z"), fechaLimiteAbono: null,
      },
    ]);
  });

  test("plan del Excel que no existe como Plan: sin planId ni suscripción, precio del Excel", async () => {
    const { deps, creados, suscripciones } = crearDeps({ referencia: { planNombre: null, precioPlanUSD: 15 } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].planId).toBeNull();
    expect(creados[0].precioPlan).toBe(15);
    expect(suscripciones).toEqual([]);
  });

  test("sin vencimiento: se crea el miembro sin fecha y sin suscripción", async () => {
    const { deps, creados, suscripciones } = crearDeps({ referencia: { fechaVencimiento: null } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].fechaVencimiento).toBeNull();
    expect(suscripciones).toEqual([]);
  });

  test("sin precio en el padrón usa el del plan encontrado, o 0", async () => {
    const { deps, creados } = crearDeps({ referencia: { precioPlanUSD: null } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].precioPlan).toBe(30);
    const sinPlan = crearDeps({ referencia: { precioPlanUSD: null, planNombre: null } });
    await activarMiembroPorCedula(sinPlan.deps, input);
    expect(sinPlan.creados[0].precioPlan).toBe(0);
  });
});
