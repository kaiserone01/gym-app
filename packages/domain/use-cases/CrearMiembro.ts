import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro, DatosNuevoMiembro } from "../entities/Miembro";

export class CedulaDuplicadaError extends Error {
  constructor() {
    super("Ya existe un miembro con esa cédula en esta organización.");
  }
}

export async function crearMiembro(
  deps: { miembros: IMemberRepository },
  input: DatosNuevoMiembro
): Promise<Miembro> {
  const existente = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);

  if (existente) {
    throw new CedulaDuplicadaError();
  }

  return deps.miembros.crear(input);
}
