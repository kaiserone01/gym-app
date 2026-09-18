export type EstadoTurno = "ABIERTO" | "CERRADO";

export interface Turno {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: number;
  fondoInicialBs: number;
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: EstadoTurno;
}

export interface DatosNuevoTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: number;
  fondoInicialBs: number;
}
