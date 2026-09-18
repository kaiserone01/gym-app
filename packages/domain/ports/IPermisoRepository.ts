import { Permiso, ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface IPermisoRepository {
  tiene(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean>;
  listarPorUsuario(usuarioId: string): Promise<Permiso[]>;
  reemplazarTodos(usuarioId: string, permisos: Permiso[]): Promise<void>;
}
