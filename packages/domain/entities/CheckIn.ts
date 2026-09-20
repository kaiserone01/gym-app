export type EstadoCheckIn = "activo" | "vencido" | "sucursal_incorrecta";

export interface CheckIn {
  id: string;
  sucursalId: string;
  miembroId: string;
  fechaHora: Date;
  estadoAlMomento: EstadoCheckIn;
}

export interface EstadisticaCheckInPorSucursal {
  sucursalId: string;
  nombreSucursal: string;
  cantidad: number;
}
