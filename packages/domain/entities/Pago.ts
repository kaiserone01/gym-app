export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  registradoPorNombre?: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
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
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaInicioCiclo: Date;
  fechaFinCiclo: Date;
}

// Pagos de fondos fraccionados/mixtos ("abonos") — varios Pago pueden
// compartir el mismo ciclo (misma fechaFinCiclo) hasta completar el precio
// del plan. Estos dos helpers son la única fuente de verdad de "qué pagos
// pertenecen a este ciclo" y "cuánto suman" — los usa tanto RegistrarPago
// (para decidir si un pago nuevo arranca un ciclo o completa uno abierto)
// como las pantallas que muestran el saldo pendiente y agrupan los abonos.
export function pagosVigentesDelCiclo(pagos: Pago[], fechaFinCiclo: Date): Pago[] {
  return pagos.filter((pago) => !pago.anuladoEn && pago.fechaFinCiclo?.getTime() === fechaFinCiclo.getTime());
}

export function totalPagado(pagos: Pago[]): number {
  return pagos.reduce((suma, pago) => suma + pago.monto, 0);
}
