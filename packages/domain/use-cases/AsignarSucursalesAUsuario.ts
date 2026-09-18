import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";

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

export async function asignarSucursalesAUsuario(
  deps: { usuarios: IUsuarioAdminRepository; usuarioSucursales: IUsuarioSucursalRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioId: string; sucursalIds: string[] }
): Promise<void> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.usuarioId);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  await deps.usuarioSucursales.reemplazarTodas(input.usuarioId, input.sucursalIds);
}
