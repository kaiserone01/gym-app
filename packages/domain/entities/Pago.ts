export interface Pago {
  id: string;
  miembroId: string;
  monto: number;
  metodo: string;
  tasaCambio: number | null;
  fechaPago: Date;
}

export interface DatosNuevoPago {
  miembroId: string;
  monto: number;
  metodo: string;
  tasaCambio: number | null;
}
