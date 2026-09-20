import { EntrenadorResumen } from "../entities/EntrenadorResumen";

export interface IEntrenadorRepository {
  // Usuarios administradores con rol ENTRENADOR, activos, que tienen la
  // sucursal indicada asignada en UsuarioSucursal (ver diseño acordado:
  // el "entrenador" ya no es una entidad propia, es un UsuarioAdmin).
  listarPorOrganizacionYSucursal(organizacionId: string, sucursalId: string): Promise<EntrenadorResumen[]>;
}
