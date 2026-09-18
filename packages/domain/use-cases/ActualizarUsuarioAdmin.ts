import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { UsuarioAdmin, CambiosUsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño puede administrar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export async function actualizarUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; id: string; cambios: CambiosUsuarioAdmin }
): Promise<UsuarioAdmin> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  const actualizado = await deps.usuarios.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizado) {
    throw new UsuarioNoEncontradoError();
  }

  return actualizado;
}
