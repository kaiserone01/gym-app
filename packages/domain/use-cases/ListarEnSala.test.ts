import { describe, expect, test } from "vitest";
import { listarEnSala, listarHistorialSala, requiereCobro } from "./ListarEnSala";
import type { ICheckInRepository } from "../ports/ICheckInRepository";
import type { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import type { ISucursalRepository } from "../ports/ISucursalRepository";
import type { CheckInEnSala } from "../entities/CheckIn";
import type { Suscripcion } from "../entities/Suscripcion";

const AHORA = new Date("2026-09-29T15:00:00Z");
const DIA = 86_400_000;

function checkIn(id: string, miembroId: string, minutosAtras: number, fechaVencimiento: Date | null, porRegularizar = false, salidaAt: Date | null = null): CheckInEnSala {
  return {
    id,
    miembroId,
    fechaHora: new Date(AHORA.getTime() - minutosAtras * 60_000),
    salidaAt,
    miembro: { nombre: `Miembro ${miembroId}`, fotoUrl: null, sucursalId: null, fechaVencimiento, planNombre: null, porRegularizar },
  };
}

function deps(abiertos: CheckInEnSala[], miembrosConSuscripcion: string[], diasGracia = 0) {
  const checkIns = { listarEnSala: async () => abiertos, listarDesde: async () => abiertos } as unknown as ICheckInRepository;
  const suscripciones = {
    buscarActivaVigentePorMiembro: async (miembroId: string) =>
      miembrosConSuscripcion.includes(miembroId) ? ({ fechaLimiteAbono: null } as Suscripcion) : null,
  } as unknown as ISuscripcionRepository;
  const sucursales = { buscarPorId: async () => ({ diasGracia }) } as unknown as ISucursalRepository;
  return { checkIns, suscripciones, sucursales };
}

describe("requiereCobro", () => {
  test("alerta solo en vencido, en_gracia y abono_vencido", () => {
    expect(requiereCobro("vencido")).toBe(true);
    expect(requiereCobro("en_gracia")).toBe(true);
    expect(requiereCobro("abono_vencido")).toBe(true);
    expect(requiereCobro("activo")).toBe(false);
    expect(requiereCobro("sucursal_incorrecta")).toBe(false);
  });
});

describe("listarEnSala", () => {
  const input = { organizacionId: "org", sucursalId: "suc", ahora: AHORA };

  test("pone primero a quienes hay que cobrar y recalcula el estado en vivo", async () => {
    const vencido = new Date(AHORA.getTime() - 30 * DIA);
    const personas = await listarEnSala(
      deps([checkIn("c1", "vigente", 5, null), checkIn("c2", "moroso", 20, vencido)], ["vigente"]),
      input
    );
    expect(personas.map((p) => [p.miembroId, p.estado, p.requiereCobro])).toEqual([
      ["moroso", "vencido", true],
      ["vigente", "activo", false],
    ]);
  });

  test("si el miembro pagó después de entrar, ya no requiere cobro", async () => {
    const vencido = new Date(AHORA.getTime() - 30 * DIA);
    const [persona] = await listarEnSala(deps([checkIn("c1", "m1", 5, vencido)], ["m1"]), input);
    expect(persona.requiereCobro).toBe(false);
  });

  test("propaga porRegularizar para que el cobro se haga desde la ficha", async () => {
    const vencido = new Date(AHORA.getTime() - 30 * DIA);
    const [persona] = await listarEnSala(deps([checkIn("c1", "m1", 5, vencido, true)], []), input);
    expect(persona.porRegularizar).toBe(true);
    expect(persona.requiereCobro).toBe(true);
  });

  test("marca en_gracia dentro de los días de gracia de la sucursal", async () => {
    const vencidoHace1Dia = new Date(AHORA.getTime() - DIA);
    const [persona] = await listarEnSala(deps([checkIn("c1", "m1", 5, vencidoHace1Dia)], [], 3), input);
    expect(persona.estado).toBe("en_gracia");
    expect(persona.requiereCobro).toBe(true);
  });

  test("un miembro con dos check-ins abiertos aparece una sola vez (el más reciente)", async () => {
    const personas = await listarEnSala(
      deps([checkIn("nuevo", "m1", 5, null), checkIn("viejo", "m1", 90, null)], ["m1"]),
      input
    );
    expect(personas.map((p) => p.checkInId)).toEqual(["nuevo"]);
  });

  test("sin check-ins abiertos devuelve lista vacía", async () => {
    expect(await listarEnSala(deps([], []), input)).toEqual([]);
  });
});

describe("listarHistorialSala", () => {
  const base = { organizacionId: "org", sucursalId: "suc", ahora: AHORA };

  test("incluye a quien ya salió, con su hora de salida, y mantiene el orden por entrada", async () => {
    const salida = new Date(AHORA.getTime() - 10 * 60_000);
    const personas = await listarHistorialSala(
      deps([checkIn("c1", "m1", 5, null), checkIn("c2", "m2", 120, null, false, salida)], ["m1", "m2"]),
      { ...base, rango: "24h" }
    );
    expect(personas.map((p) => [p.miembroId, p.salidaAt])).toEqual([
      ["m1", null],
      ["m2", salida],
    ]);
  });

  test("una fila por persona (la entrada más reciente) y estado de pago recalculado hoy", async () => {
    const vencido = new Date(AHORA.getTime() - 30 * DIA);
    const personas = await listarHistorialSala(
      deps([checkIn("nuevo", "m1", 5, vencido), checkIn("viejo", "m1", 600, vencido)], ["m1"]),
      { ...base, rango: "hoy" }
    );
    expect(personas.map((p) => [p.checkInId, p.estado])).toEqual([["nuevo", "activo"]]);
  });

  test("pide al repositorio desde las últimas 24 horas o desde el inicio del día de Caracas", async () => {
    const desdes: Date[] = [];
    const d = deps([], []);
    d.checkIns = { listarDesde: async (_s: string, desde: Date) => (desdes.push(desde), []) } as unknown as ICheckInRepository;
    await listarHistorialSala(d, { ...base, rango: "24h" });
    await listarHistorialSala(d, { ...base, rango: "hoy" });
    expect(desdes[0]).toEqual(new Date(AHORA.getTime() - 24 * 3_600_000));
    expect(desdes[1]).toEqual(new Date("2026-09-29T04:00:00Z"));
  });
});
