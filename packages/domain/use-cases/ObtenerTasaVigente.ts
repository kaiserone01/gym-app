import type { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import type { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("No hay ninguna tasa de cambio guardada todavía.");
  }
}

// Criterio del negocio (2026-09-26): SIEMPRE la última tasa publicada, desde su publicación.
// No se difiere por fecha valor bajo ningún concepto.
// AL_DIA: la última guardada tiene fecha valor >= hoy.
// DESACTUALIZADA: fecha valor < hoy → casi seguro hay una publicación posterior sin sincronizar.
export type EstadoTasa = "AL_DIA" | "DESACTUALIZADA";

export interface TasaVigente {
  tasa: TasaCambio;
  estado: EstadoTasa;
}

export async function obtenerTasaVigente(
  deps: { tasas: ITasaCambioRepository },
  hoy: Date
): Promise<TasaVigente> {
  const ultima = await deps.tasas.obtenerUltima();
  if (!ultima) throw new SinTasaDisponibleError();
  return { tasa: ultima, estado: ultima.fecha < hoy ? "DESACTUALIZADA" : "AL_DIA" };
}
