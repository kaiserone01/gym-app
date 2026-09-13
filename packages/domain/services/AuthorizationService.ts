import { IAuthorizationService } from "../ports/IAuthorizationService";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class AuthorizationService implements IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, _rolACrear: RolUsuario): boolean {
    // Única regla aprobada hasta ahora (ADR-001 v2 §16): crear UsuarioAdmin es
    // exclusivo de DUENO. No se modela una matriz de permisos por rol/acción
    // hasta que un segundo caso de uso real lo exija (ADR-001 v1 §13.2).
    return rolSolicitante === "DUENO";
  }
}
