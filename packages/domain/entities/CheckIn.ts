export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta";

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
