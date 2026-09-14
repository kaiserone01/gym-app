import { IEntrenadorRepository } from "../ports/IEntrenadorRepository";
import { EntrenadorResumen } from "../entities/EntrenadorResumen";

export async function listarEntrenadores(
  deps: { entrenadores: IEntrenadorRepository },
  organizacionId: string
): Promise<EntrenadorResumen[]> {
  return deps.entrenadores.listarPorOrganizacion(organizacionId);
}
