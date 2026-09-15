export interface Pago {
  id: string;
  miembroId: string;
  // Solo poblado por listarPorOrganizacion/listarPorOrganizacionYRango
  // (denormalizado, igual que Miembro.entrenadorNombre) — listarPorMiembro
  // no lo necesita porque el llamador ya sabe de qué miembro se trata.
  miembroNombre?: string;
  // Solo poblado por listarPorOrganizacionYRango — precio del plan que el
  // Miembro tiene hoy, usado por el reporte de caja para agrupar por tipo
  // de plan. No es el precio pagado en esta transacción puntual.
  miembroPrecioPlan?: number;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  fechaPago: Date;
}

export interface DatosNuevoPago {
  miembroId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}
