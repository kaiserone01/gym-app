import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro, CambiosMiembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function actualizarMiembro(
  deps: { miembros: IMemberRepository },
  input: { organizacionId: string; id: string; cambios: CambiosMiembro }
): Promise<Miembro> {
  const actualizado = await deps.miembros.actualizar(input.organizacionId, input.id, input.cambios);

  if (!actualizado) {
    throw new MiembroNoEncontradoError();
  }

  return actualizado;
}
