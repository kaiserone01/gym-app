import { RolUsuario } from "../entities/UsuarioAdmin";

export interface IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, rolACrear: RolUsuario): boolean;
}
