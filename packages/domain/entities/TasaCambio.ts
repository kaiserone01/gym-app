export interface TasaCambio {
  id: string;
  fecha: Date;
  valor: number;
  // Columna libre en Prisma (no un enum de base de datos): "BCV" | "BINANCE_P2P" | "MANUAL".
  fuente: string;
}
