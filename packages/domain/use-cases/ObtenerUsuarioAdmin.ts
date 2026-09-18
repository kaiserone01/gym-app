import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";
import { Permiso } from "../entities/Permiso";

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export interface DetalleUsuarioAdmin {
  usuario: UsuarioAdmin;
  sucursalIds: string[];
  permisos: Permiso[];
}

export async function obtenerUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository; usuarioSucursales: IUsuarioSucursalRepository; permisos: IPermisoRepository },
  input: { organizacionId: string; id: string }
): Promise<DetalleUsuarioAdmin> {
  const usuario = await deps.usuarios.buscarPorId(input.organizacionId, input.id);
  if (!usuario) {
    throw new UsuarioNoEncontradoError();
  }

  const [sucursalIds, permisos] = await Promise.all([
    deps.usuarioSucursales.listarSucursalIdsPorUsuario(input.id),
    deps.permisos.listarPorUsuario(input.id),
  ]);

  return { usuario, sucursalIds, permisos };
}
