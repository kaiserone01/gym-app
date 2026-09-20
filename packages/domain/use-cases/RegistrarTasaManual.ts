import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class TasaInvalidaError extends Error {
  constructor() {
    super("El valor de la tasa debe ser mayor a cero.");
  }
}

// Ingreso manual de la tasa BCV cuando la API de consulta falla — requiere
// doble confirmación en la UI (ver diseño acordado). Se guarda con fuente
// MANUAL, visible de inmediato para el resto de la organización.
export async function registrarTasaManual(
  deps: { tasas: ITasaCambioRepository },
  input: { valor: number }
): Promise<TasaCambio> {
  if (!(input.valor > 0)) {
    throw new TasaInvalidaError();
  }

  return deps.tasas.guardar(new Date(), input.valor, "MANUAL");
}
