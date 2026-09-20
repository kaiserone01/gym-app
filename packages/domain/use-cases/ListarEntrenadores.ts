import { IEntrenadorRepository } from "../ports/IEntrenadorRepository";
import { EntrenadorResumen } from "../entities/EntrenadorResumen";

export async function listarEntrenadores(
  deps: { entrenadores: IEntrenadorRepository },
  organizacionId: string,
  sucursalId: string
): Promise<EntrenadorResumen[]> {
  return deps.entrenadores.listarPorOrganizacionYSucursal(organizacionId, sucursalId);
}
