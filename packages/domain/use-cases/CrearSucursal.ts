import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Sucursal } from "../entities/Sucursal";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("No tenés permiso para crear sucursales.");
  }
}

export interface DatosCrearSucursal {
  organizacionId: string;
  usuarioIdSolicitante: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
}

export async function crearSucursal(
  deps: { sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: DatosCrearSucursal
): Promise<Sucursal> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "SUCURSALES", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  return deps.sucursales.crear({
    organizacionId: input.organizacionId,
    nombre: input.nombre,
    direccion: input.direccion,
    diasGracia: input.diasGracia,
  });
}
