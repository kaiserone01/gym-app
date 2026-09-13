import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan } from "../entities/Plan";

export async function listarPlanes(deps: { planes: IPlanRepository }, organizacionId: string): Promise<Plan[]> {
  return deps.planes.listarPorOrganizacion(organizacionId);
}
