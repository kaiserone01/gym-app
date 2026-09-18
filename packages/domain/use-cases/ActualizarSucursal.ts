import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Sucursal, CambiosSucursal } from "../entities/Sucursal";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("No tenés permiso para editar sucursales.");
  }
}

export class SucursalNoEncontradaError extends Error {
  constructor() {
    super("No se encontró la sucursal.");
  }
}

export async function actualizarSucursal(
  deps: { sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; usuarioIdSolicitante: string; id: string; cambios: CambiosSucursal }
): Promise<Sucursal> {
  const accion = input.cambios.activo !== undefined ? "ELIMINAR" : "EDITAR";
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "SUCURSALES", accion))) {
    throw new RolNoAutorizadoError();
  }

  const actualizada = await deps.sucursales.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizada) {
    throw new SucursalNoEncontradaError();
  }

  return actualizada;
}
