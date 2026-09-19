export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaPago: Date;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
}

export interface DatosNuevoPago {
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
}
