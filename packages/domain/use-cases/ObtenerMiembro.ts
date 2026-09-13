import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function obtenerMiembro(
  deps: { miembros: IMemberRepository },
  input: { organizacionId: string; id: string }
): Promise<Miembro> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.id);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return miembro;
}
