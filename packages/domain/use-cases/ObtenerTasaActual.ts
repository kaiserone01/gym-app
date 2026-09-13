import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("No hay ninguna tasa de cambio guardada todavía.");
  }
}

export async function obtenerTasaActual(deps: { tasas: ITasaCambioRepository }): Promise<TasaCambio> {
  const ultima = await deps.tasas.obtenerUltima();

  if (!ultima) {
    throw new SinTasaDisponibleError();
  }

  return ultima;
}
