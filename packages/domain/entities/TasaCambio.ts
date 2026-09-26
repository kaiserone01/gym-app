export interface TasaCambio {
  id: string;
  fecha: Date;
  valor: number;
  // Columna libre en Prisma (no un enum de base de datos): "BCV" | "BINANCE_P2P" | "MANUAL".
  fuente: string;
  // UsuarioAdmin.id — solo se conoce para fuente MANUAL; null en filas BCV
  // o en MANUAL registradas antes de que existiera esta columna.
  registradoPorId: string | null;
  createdAt: Date;
}
