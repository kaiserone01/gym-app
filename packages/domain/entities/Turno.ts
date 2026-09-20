export type EstadoTurno = "ABIERTO" | "CERRADO";

export interface Turno {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  // Solo efectivo físico en caja al abrir el turno — no incluye bancos ni
  // puntos de venta (ver ObtenerResumenTurno).
  fondoInicialEfectivoUSD: number;
  fondoInicialEfectivoBs: number;
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: EstadoTurno;
}

export interface DatosNuevoTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialEfectivoUSD: number;
  fondoInicialEfectivoBs: number;
}
