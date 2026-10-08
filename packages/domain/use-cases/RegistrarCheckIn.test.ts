import { afterEach, describe, expect, test, vi } from "vitest";
import { registrarCheckIn } from "./RegistrarCheckIn";
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
        genero: null,
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

describe("registrarCheckIn — género y cumpleaños", () => {
  test("devuelve el género del miembro", async () => {
    const resultado = await registrarCheckIn(crearDeps({ genero: "FEMENINO" }), input);
    expect(resultado.genero).toBe("FEMENINO");
  });

  test("devuelve género null cuando el miembro no lo tiene definido", async () => {
    const resultado = await registrarCheckIn(crearDeps({ genero: null }), input);
    expect(resultado.genero).toBeNull();
  });

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
