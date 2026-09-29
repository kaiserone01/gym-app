import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para anular deudas.");
  }
}

export class DeudaNoPendienteError extends Error {
  constructor() {
    super("Esta deuda ya no está pendiente (fue cobrada o anulada).");
  }
}

export async function anularDeuda(
  deps: { deudas: IDeudaProductoRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; id: string; anuladaPorId: string }
): Promise<void> {
  if (!(await deps.autorizacion.tienePermiso(input.anuladaPorId, "PAGOS", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  const afectadas = await deps.deudas.anular(input.organizacionId, input.id, input.anuladaPorId, new Date());
  if (afectadas === 0) {
    throw new DeudaNoPendienteError();
  }
}
