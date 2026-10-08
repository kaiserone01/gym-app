export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta";

export interface CheckIn {
  id: string;
  sucursalId: string;
  miembroId: string;
  fechaHora: Date;
  estadoAlMomento: EstadoCheckIn;
  salidaAt: Date | null;
}

// Check-in abierto (sin salida) junto con los datos del miembro necesarios para "En sala".
export interface CheckInEnSala {
  id: string;
  miembroId: string;
  fechaHora: Date;
  miembro: {
    nombre: string;
    fotoUrl: string | null;
    sucursalId: string | null;
    fechaVencimiento: Date | null;
    planNombre: string | null;
    ajustarFecha: boolean;
  };
}
