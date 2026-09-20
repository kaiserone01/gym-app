import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan, DatosNuevoPlan } from "../entities/Plan";

export async function crearPlan(deps: { planes: IPlanRepository }, input: DatosNuevoPlan): Promise<Plan> {
  return deps.planes.crear(input);
}
