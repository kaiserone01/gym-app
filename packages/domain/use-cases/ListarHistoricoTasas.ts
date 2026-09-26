import type { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import type { TasaCambio } from "../entities/TasaCambio";

export type ResultadoBusquedaPorFecha =
  | { tipo: "ENCONTRADA"; tasa: TasaCambio }
  | { tipo: "NO_ENCONTRADA"; masCercanaAnterior: TasaCambio | null };

export interface ResultadoRecientes {
  filas: TasaCambio[];
  hayMas: boolean;
}

export type InputListarHistoricoTasas =
  | { modo: "recientes"; antesDe: Date | null; limite: number }
  | { modo: "fecha"; fecha: Date };

export function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: { modo: "recientes"; antesDe: Date | null; limite: number }
): Promise<ResultadoRecientes>;
export function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: { modo: "fecha"; fecha: Date }
): Promise<ResultadoBusquedaPorFecha>;
export async function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: InputListarHistoricoTasas
): Promise<ResultadoRecientes | ResultadoBusquedaPorFecha> {
  if (input.modo === "recientes") {
    // Se piden limite+1 para saber si hay una página siguiente sin una
    // segunda consulta — se descarta la fila extra antes de devolver.
    const filas = await deps.tasas.listarHistorico({ antesDe: input.antesDe, limite: input.limite + 1 });
    const hayMas = filas.length > input.limite;
    return { filas: filas.slice(0, input.limite), hayMas };
  }

  const exacta = await deps.tasas.buscarPorFecha(input.fecha);
  if (exacta) return { tipo: "ENCONTRADA", tasa: exacta };

  const masCercanaAnterior = await deps.tasas.buscarMasCercanaAnterior(input.fecha);
  return { tipo: "NO_ENCONTRADA", masCercanaAnterior };
}
