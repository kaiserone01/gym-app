import { TasaCambio } from "../entities/TasaCambio";

export interface ITasaCambioRepository {
  guardar(fecha: Date, valor: number, fuente: string, registradoPorId?: string | null): Promise<TasaCambio>;
  obtenerUltima(): Promise<TasaCambio | null>;
  guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number>; // filas escritas
  // Historial (más reciente primero). Si antesDe no es null, solo filas
  // con fecha estrictamente menor — así se pagina "hacia atrás" en el tiempo.
  listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]>;
  // La fila cuya fecha valor es exactamente igual a `fecha`, o null.
  buscarPorFecha(fecha: Date): Promise<TasaCambio | null>;
  // La fila con la mayor fecha <= `fecha` (la que habría estado vigente
  // ese día según el criterio "siempre la última publicada"), o null si
  // no hay ninguna fila igual o anterior a esa fecha.
  buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null>;
}
