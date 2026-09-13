import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("No hay ninguna tasa de cambio guardada todavía.");
  }
}

export interface ResultadoConversion {
  montoVES: number;
  tasaUsada: number;
  fechaTasa: Date;
}

export async function convertirMontoUSDaVES(
  deps: { tasas: ITasaCambioRepository },
  montoUSD: number
): Promise<ResultadoConversion> {
  const ultima = await deps.tasas.obtenerUltima();

  if (!ultima) {
    throw new SinTasaDisponibleError();
  }

  return {
    montoVES: Math.round(montoUSD * ultima.valor * 100) / 100,
    tasaUsada: ultima.valor,
    fechaTasa: ultima.fecha,
  };
}
