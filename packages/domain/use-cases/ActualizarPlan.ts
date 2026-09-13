import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan, CambiosPlan } from "../entities/Plan";

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export async function actualizarPlan(
  deps: { planes: IPlanRepository },
  input: { organizacionId: string; id: string; cambios: CambiosPlan }
): Promise<Plan> {
  const actualizado = await deps.planes.actualizar(input.organizacionId, input.id, input.cambios);

  if (!actualizado) {
    throw new PlanNoEncontradoError();
  }

  return actualizado;
}
