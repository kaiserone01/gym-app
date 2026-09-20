import { IMetodoPagoRepository } from "../ports/IMetodoPagoRepository";
import { MetodoPago, CambiosMetodoPago } from "../entities/MetodoPago";

export class MetodoPagoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el método de pago.");
  }
}

export async function actualizarMetodoPago(
  deps: { metodosPago: IMetodoPagoRepository },
  input: { organizacionId: string; id: string; cambios: CambiosMetodoPago }
): Promise<MetodoPago> {
  const actualizado = await deps.metodosPago.actualizar(input.organizacionId, input.id, input.cambios);

  if (!actualizado) {
    throw new MetodoPagoNoEncontradoError();
  }

  return actualizado;
}
