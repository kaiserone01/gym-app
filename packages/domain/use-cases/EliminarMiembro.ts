import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { MiembroNoEncontradoError } from "./ActualizarMiembro";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para eliminar miembros.");
  }
}

// Borra al miembro y todo su historial (pagos, suscripciones, check-ins, deudas).
// Irreversible: los pagos borrados dejan de contar en cajas y reportes.
export async function eliminarMiembro(
  deps: { miembros: IMemberRepository; sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; id: string; sucursalActivaId: string; usuarioIdSolicitante: string }
): Promise<void> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "MIEMBROS", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.id);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  await deps.miembros.eliminarConHistorial(input.organizacionId, input.id);
}
