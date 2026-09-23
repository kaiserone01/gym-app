import { IPlanRepository } from "../ports/IPlanRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para eliminar planes.");
  }
}

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export class PlanConHistorialError extends Error {
  constructor() {
    super("No se puede eliminar: hay miembros o suscripciones usando este plan.");
  }
}

export async function eliminarPlan(
  deps: { planes: IPlanRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; id: string; usuarioIdSolicitante: string }
): Promise<void> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "PLANES", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.planes.buscarPorId(input.organizacionId, input.id);
  if (!existente) {
    throw new PlanNoEncontradoError();
  }

  try {
    await deps.planes.eliminar(input.id);
  } catch {
    throw new PlanConHistorialError();
  }
}
