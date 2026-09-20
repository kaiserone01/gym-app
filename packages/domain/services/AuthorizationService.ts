import { IAuthorizationService } from "../ports/IAuthorizationService";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export class AuthorizationService implements IAuthorizationService {
  constructor(private readonly permisos: IPermisoRepository) {}

  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, _rolACrear: RolUsuario): boolean {
    return rolSolicitante === "SOCIO";
  }

  async tienePermiso(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean> {
    return this.permisos.tiene(usuarioId, modulo, accion);
  }
}
