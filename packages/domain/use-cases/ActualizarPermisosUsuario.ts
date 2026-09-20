import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { Permiso } from "../entities/Permiso";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el socio puede administrar permisos.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export async function actualizarPermisosUsuario(
  deps: { usuarios: IUsuarioAdminRepository; permisos: IPermisoRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioId: string; permisos: Permiso[] }
): Promise<void> {
  if (input.rolSolicitante !== "SOCIO") {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.usuarioId);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  await deps.permisos.reemplazarTodos(input.usuarioId, input.permisos);
}
