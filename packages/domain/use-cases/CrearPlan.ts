import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan, DatosNuevoPlan } from "../entities/Plan";

export class SucursalesRequeridasError extends Error {
  constructor() {
    super("Un plan que no es TODA_LA_ORGANIZACION necesita al menos una sucursal asignada.");
  }
}

export class SucursalInvalidaError extends Error {
  constructor() {
    super("Una o más sucursales indicadas no pertenecen a esta organización.");
  }
}

export async function crearPlan(deps: { planes: IPlanRepository }, input: DatosNuevoPlan): Promise<Plan> {
  if (input.tipoAcceso !== "TODA_LA_ORGANIZACION") {
    if (input.sucursalIds.length === 0) {
      throw new SucursalesRequeridasError();
    }

    const valido = await deps.planes.sucursalesValidas(input.organizacionId, input.sucursalIds);
    if (!valido) {
      throw new SucursalInvalidaError();
    }
  }

  return deps.planes.crear(input);
}
