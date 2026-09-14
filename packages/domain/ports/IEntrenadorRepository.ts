import { EntrenadorResumen } from "../entities/EntrenadorResumen";

export interface IEntrenadorRepository {
  // Solo entrenadores activos, de cualquier sucursal de la organización —
  // un Miembro cuelga de la Organización, no de una Sucursal (ADR v1 §4.1),
  // así que puede elegir cualquier entrenador de su gym.
  listarPorOrganizacion(organizacionId: string): Promise<EntrenadorResumen[]>;
}
