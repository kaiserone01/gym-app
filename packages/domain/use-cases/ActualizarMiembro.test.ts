import { describe, expect, test } from "vitest";
import { actualizarMiembro, AjusteFechaNoDisponibleError, CedulaDuplicadaError, FechasIncoherentesError } from "./ActualizarMiembro";
import type { CambiosMiembro } from "../entities/Miembro";

type OpcionesMiembro = {
  vieneDelExcel?: boolean;
  fechaUltimoPago?: Date | null;
  fechaVencimiento?: Date | null;
};

function crearDeps(porRegularizar = true, cedulaOcupadaPor: string | null = null, miembro: OpcionesMiembro = {}) {
  const cambiosGuardados: CambiosMiembro[] = [];
  const ciclos: { inicio: Date; fin: Date }[] = [];
  const extensiones: Date[] = [];
  const cambiosDePlan: string[] = [];
  const deps = {
    miembros: {
      buscarPorId: async () => ({
        id: "m1", sucursalId: null, planId: "p1", cedula: "111", porRegularizar,
        vieneDelExcel: false, fechaUltimoPago: null, fechaVencimiento: null, ...miembro,
      }),
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
      buscarActivaVigentePorMiembroYPlan: async () => ({ id: "s1", inicio: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }),
      extenderFin: async (_id: string, fin: Date) => {
        extensiones.push(fin);
      },
      cambiarPlan: async (_id: string, planId: string) => {
        cambiosDePlan.push(planId);
      },
    },
    sucursales: {},
  } as unknown as Parameters<typeof actualizarMiembro>[0];
  return { deps, cambiosGuardados, ciclos, extensiones, cambiosDePlan };
}

const base = { organizacionId: "org", id: "m1", sucursalActivaId: "s1" };
const DIA = 24 * 60 * 60 * 1000;

describe("actualizarMiembro — ajuste manual de fechas", () => {
  const pago = new Date("2026-10-01T00:00:00.000Z");
  const venc = new Date("2026-11-15T00:00:00.000Z");

  test("con el aviso activo: guarda la fecha, apaga el aviso y sincroniza la suscripción (fin y inicio = fin - días del plan)", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: venc } });
    expect(cambiosGuardados[0]).toEqual({ fechaVencimiento: venc, porRegularizar: false });
    expect(ciclos).toEqual([{ inicio: new Date(venc.getTime() - 30 * DIA), fin: venc }]);
  });

  test("un miembro que viene del Excel puede ajustar fechas aunque no tenga el aviso", async () => {
    const { deps, cambiosGuardados } = crearDeps(false, null, { vieneDelExcel: true });
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: venc } });
    expect(cambiosGuardados[0]).toEqual({ fechaVencimiento: venc, porRegularizar: false });
  });

  test("sin venir del Excel ni tener el aviso no se pueden cambiar las fechas", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await expect(actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: venc } })).rejects.toBeInstanceOf(AjusteFechaNoDisponibleError);
    await expect(actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: pago } })).rejects.toBeInstanceOf(AjusteFechaNoDisponibleError);
    expect(cambiosGuardados).toEqual([]);
  });

  test("la fecha de pago posterior al vencimiento es incoherente", async () => {
    const { deps, cambiosGuardados } = crearDeps();
    await expect(
      actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: venc, fechaVencimiento: pago } })
    ).rejects.toBeInstanceOf(FechasIncoherentesError);
    expect(cambiosGuardados).toEqual([]);
  });

  test("valida contra la fecha actual del miembro cuando solo cambia una", async () => {
    const { deps } = crearDeps(true, null, { fechaVencimiento: pago });
    await expect(actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: venc } })).rejects.toBeInstanceOf(FechasIncoherentesError);
  });

  test("guardar la fecha de pago apaga el aviso", async () => {
    const { deps, cambiosGuardados } = crearDeps(true, null, { fechaVencimiento: venc });
    await actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: pago } });
    expect(cambiosGuardados[0]).toEqual({ fechaUltimoPago: pago, porRegularizar: false });
  });

  test("ciclo [pago, vencimiento] cuando cambian ambas fechas", async () => {
    const { deps, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: pago, fechaVencimiento: venc } });
    expect(ciclos).toEqual([{ inicio: pago, fin: venc }]);
  });

  test("solo cambia el pago: el fin es el vencimiento actual del miembro", async () => {
    const { deps, ciclos } = crearDeps(true, null, { fechaVencimiento: venc });
    await actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: pago } });
    expect(ciclos).toEqual([{ inicio: pago, fin: venc }]);
  });

  test("solo cambia el vencimiento: el inicio es la fecha de pago actual si existe", async () => {
    const { deps, ciclos } = crearDeps(true, null, { fechaUltimoPago: pago });
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: venc } });
    expect(ciclos).toEqual([{ inicio: pago, fin: venc }]);
  });

  test("sin fecha de pago el inicio es fin - días del plan", async () => {
    const { deps, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { fechaVencimiento: venc } });
    expect(ciclos).toEqual([{ inicio: new Date(venc.getTime() - 30 * DIA), fin: venc }]);
  });

  test("solo cambia el pago y no hay vencimiento: guarda pero no sincroniza la suscripción", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: pago } });
    expect(cambiosGuardados[0]).toEqual({ fechaUltimoPago: pago, porRegularizar: false });
    expect(ciclos).toEqual([]);
  });

  test("fechaUltimoPago null se guarda (vaciar la fecha de pago) y apaga el aviso", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps(true, null, { fechaUltimoPago: pago, fechaVencimiento: venc });
    await actualizarMiembro(deps, { ...base, cambios: { fechaUltimoPago: null } });
    expect(cambiosGuardados[0]).toEqual({ fechaUltimoPago: null, porRegularizar: false });
    expect(ciclos).toEqual([{ inicio: new Date(venc.getTime() - 30 * DIA), fin: venc }]);
  });

  test("sin cambio de fecha no toca la suscripción ni el aviso", async () => {
    const { deps, cambiosGuardados, ciclos } = crearDeps();
    await actualizarMiembro(deps, { ...base, cambios: { nombre: "Otro" } });
    expect(cambiosGuardados[0]).toEqual({ nombre: "Otro" });
    expect(ciclos).toEqual([]);
  });
});

describe("actualizarMiembro — cambio de plan", () => {
  test("miembro normal: prorratea el vencimiento y cambia el plan de la suscripción", async () => {
    const { deps, extensiones, cambiosDePlan } = crearDeps(false);
    await actualizarMiembro(deps, { ...base, cambios: { planId: "p2" } });
    expect(extensiones).toHaveLength(1);
    expect(cambiosDePlan).toEqual(["p2"]);
  });

  test("miembro que viene del Excel: no prorratea pero sí cambia el plan de la suscripción", async () => {
    const { deps, extensiones, cambiosDePlan } = crearDeps(false, null, { vieneDelExcel: true });
    await actualizarMiembro(deps, { ...base, cambios: { planId: "p2" } });
    expect(extensiones).toEqual([]);
    expect(cambiosDePlan).toEqual(["p2"]);
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

describe("actualizarMiembro — fecha de nacimiento", () => {
  test("pasa fechaNacimiento null al repositorio (vaciar un valor no se ignora)", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await actualizarMiembro(deps, { ...base, cambios: { fechaNacimiento: null } });
    expect(cambiosGuardados[0]).toEqual({ fechaNacimiento: null });
  });

  test("pasa una fecha de nacimiento definida", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    const nacimiento = new Date(1990, 9, 8);
    await actualizarMiembro(deps, { ...base, cambios: { fechaNacimiento: nacimiento } });
    expect(cambiosGuardados[0]).toEqual({ fechaNacimiento: nacimiento });
  });
});
