import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Miembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export class MiembroFueraDeSucursalError extends Error {
  constructor(public readonly sucursalNombre: string) {
    super(`Este miembro pertenece a ${sucursalNombre}. Inicia sesión en esa sucursal para verlo o editarlo.`);
  }
}

export async function obtenerMiembro(
  deps: { miembros: IMemberRepository; sucursales: ISucursalRepository },
  input: { organizacionId: string; id: string; sucursalActivaId: string }
): Promise<Miembro> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.id);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  // null = "Ambas" (multisede) — visible desde cualquier sucursal.
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  return miembro;
}
