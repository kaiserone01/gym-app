import { TasaCambio } from "../entities/TasaCambio";

export interface ITasaCambioRepository {
  guardar(fecha: Date, valor: number, fuente: string): Promise<TasaCambio>;
  obtenerUltima(): Promise<TasaCambio | null>;
  guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number>; // filas escritas
}
