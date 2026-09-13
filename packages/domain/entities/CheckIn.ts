export type EstadoCheckIn = "activo" | "vencido";

export interface CheckIn {
  id: string;
  sucursalId: string;
  miembroId: string;
  fechaHora: Date;
  estadoAlMomento: EstadoCheckIn;
}
