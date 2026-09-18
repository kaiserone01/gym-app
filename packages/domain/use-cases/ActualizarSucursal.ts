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
  // El payload puede mezclar un cambio de estado (ELIMINAR) con cambios de datos
  // (EDITAR): exigimos cada permiso según lo que realmente venga en `cambios`,
  // para que un ELIMINAR no pueda colar ediciones ni viceversa.
  const tocaEstado = input.cambios.activo !== undefined;
  const tocaDatos =
    input.cambios.nombre !== undefined ||
    input.cambios.direccion !== undefined ||
    input.cambios.diasGracia !== undefined;

  const accionesRequeridas: ("EDITAR" | "ELIMINAR")[] = [
    ...(tocaDatos ? (["EDITAR"] as const) : []),
    ...(tocaEstado ? (["ELIMINAR"] as const) : []),
  ];

  for (const accion of accionesRequeridas) {
    if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "SUCURSALES", accion))) {
      throw new RolNoAutorizadoError();
    }
  }

  const actualizada = await deps.sucursales.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizada) {
    throw new SucursalNoEncontradaError();
  }

  return actualizada;
}
