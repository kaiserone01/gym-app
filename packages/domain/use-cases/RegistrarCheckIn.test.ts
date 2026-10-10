import { afterEach, describe, expect, test, vi } from "vitest";
import { registrarCheckIn, MiembroNoEncontradoError } from "./RegistrarCheckIn";
import type { Miembro } from "../entities/Miembro";

function crearDeps(miembro: Partial<Miembro>) {
  return {
    miembros: {
      buscarPorOrganizacionYCedula: async () => ({
        id: "m1",
        nombre: "Camila Ledezma Barrios",
        fotoUrl: null,
        entrenadorNombre: null,
        fechaVencimiento: null,
        sucursalId: null,
        fechaNacimiento: null,
        ...miembro,
      }),
    },
    // Un check-in reciente existente corta antes de validar la suscripción.
    checkIns: { buscarRecientePorMiembroYSucursal: async () => ({ estadoAlMomento: "activo" }) },
    suscripciones: {},
    sucursales: { buscarPorId: async () => ({ diasGracia: 0, nombre: "Sede Principal", direccion: null }) },
  } as unknown as Parameters<typeof registrarCheckIn>[0];
}

const input = { organizacionId: "org", sucursalId: "s1", cedula: "123" };

afterEach(() => vi.useRealTimers());

describe("registrarCheckIn — cumpleaños", () => {
  test("esCumpleanos es true el día del cumpleaños en Caracas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
    const resultado = await registrarCheckIn(crearDeps({ fechaNacimiento: new Date(1990, 9, 8) }), input);
    expect(resultado.esCumpleanos).toBe(true);
  });

  test("esCumpleanos es false otro día o sin fecha de nacimiento", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
    expect((await registrarCheckIn(crearDeps({ fechaNacimiento: new Date(1990, 9, 9) }), input)).esCumpleanos).toBe(false);
    expect((await registrarCheckIn(crearDeps({ fechaNacimiento: null }), input)).esCumpleanos).toBe(false);
  });
});

describe("registrarCheckIn — activación desde el padrón", () => {
  function depsSinMiembro(activar?: (i: { organizacionId: string; sucursalId: string; cedula: string }) => Promise<Partial<Miembro> | null>) {
    return {
      miembros: { buscarPorOrganizacionYCedula: async () => null },
      checkIns: { buscarRecientePorMiembroYSucursal: async () => ({ estadoAlMomento: "vencido" }) },
      suscripciones: {},
      sucursales: { buscarPorId: async () => ({ diasGracia: 0, nombre: "Sede Principal", direccion: null }) },
      activarDesdePadron: activar,
    } as unknown as Parameters<typeof registrarCheckIn>[0];
  }

  test("si no es miembro pero el padrón lo activa, sigue el flujo normal con ese miembro", async () => {
    const llamadas: unknown[] = [];
    const deps = depsSinMiembro(async (i) => {
      llamadas.push(i);
      return { id: "nuevo", nombre: "Ana Pérez", fotoUrl: null, entrenadorNombre: null, fechaVencimiento: null, sucursalId: null, fechaNacimiento: null };
    });
    const resultado = await registrarCheckIn(deps, input);
    expect(resultado.nombre).toBe("Ana Pérez");
    expect(llamadas).toEqual([input]);
  });

  test("si tampoco está en el padrón lanza MiembroNoEncontradoError", async () => {
    await expect(registrarCheckIn(depsSinMiembro(async () => null), input)).rejects.toBeInstanceOf(MiembroNoEncontradoError);
  });

  test("sin dependencia de activación (otro contexto) sigue lanzando MiembroNoEncontradoError", async () => {
    await expect(registrarCheckIn(depsSinMiembro(undefined), input)).rejects.toBeInstanceOf(MiembroNoEncontradoError);
  });
});
