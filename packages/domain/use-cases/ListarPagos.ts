import { IPagoRepository } from "../ports/IPagoRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { Pago } from "../entities/Pago";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function listarPagos(
  deps: { pagos: IPagoRepository; miembros: IMemberRepository },
  input: { organizacionId: string; miembroId?: string }
): Promise<Pago[]> {
  if (!input.miembroId) {
    return deps.pagos.listarPorOrganizacion(input.organizacionId);
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return deps.pagos.listarPorMiembro(input.miembroId);
}
