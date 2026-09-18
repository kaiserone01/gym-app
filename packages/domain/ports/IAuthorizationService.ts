import { RolUsuario } from "../entities/UsuarioAdmin";
import { ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, rolACrear: RolUsuario): boolean;
  tienePermiso(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean>;
}
