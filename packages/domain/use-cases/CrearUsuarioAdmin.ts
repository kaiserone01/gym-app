import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { RolUsuario, UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface CrearUsuarioAdminDeps {
  usuarios: IUsuarioAdminRepository;
  autorizacion: IAuthorizationService;
}

export interface CrearUsuarioAdminInput {
  solicitante: { rol: RolUsuario };
  organizacionId: string;
  sucursalId: string | null;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
}

export class NoAutorizadoError extends Error {
  constructor(rolSolicitante: RolUsuario, rolACrear: RolUsuario) {
    super(`El rol ${rolSolicitante} no puede crear usuarios con rol ${rolACrear}.`);
  }
}

export async function crearUsuarioAdmin(
  deps: CrearUsuarioAdminDeps,
  input: CrearUsuarioAdminInput
): Promise<UsuarioAdmin> {
  if (!deps.autorizacion.puedeCrearUsuarioConRol(input.solicitante.rol, input.rol)) {
    throw new NoAutorizadoError(input.solicitante.rol, input.rol);
  }

  return deps.usuarios.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    email: input.email,
    passwordHash: input.passwordHash,
    rol: input.rol,
  });
}
