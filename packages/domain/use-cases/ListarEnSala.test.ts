import { describe, expect, test } from "vitest";
import { listarEnSala, requiereCobro } from "./ListarEnSala";
import type { ICheckInRepository } from "../ports/ICheckInRepository";
import type { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import type { ISucursalRepository } from "../ports/ISucursalRepository";
import type { CheckInEnSala } from "../entities/CheckIn";
import type { Suscripcion } from "../entities/Suscripcion";

const AHORA = new Date("2026-09-29T15:00:00Z");
const DIA = 86_400_000;

function checkIn(id: string, miembroId: string, minutosAtras: number, fechaVencimiento: Date | null, ajustarFecha = false): CheckInEnSala {
  return {
    id,
    miembroId,
    fechaHora: new Date(AHORA.getTime() - minutosAtras * 60_000),
    miembro: { nombre: `Miembro ${miembroId}`, fotoUrl: null, sucursalId: null, fechaVencimiento, planNombre: null, ajustarFecha },
  };
}

function deps(abiertos: CheckInEnSala[], miembrosConSuscripcion: string[], diasGracia = 0) {
  const checkIns = { listarEnSala: async () => abiertos } as unknown as ICheckInRepository;
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

  test("propaga ajustarFecha para que el cobro se haga desde la ficha", async () => {
    const vencido = new Date(AHORA.getTime() - 30 * DIA);
    const [persona] = await listarEnSala(deps([checkIn("c1", "m1", 5, vencido, true)], []), input);
    expect(persona.ajustarFecha).toBe(true);
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
