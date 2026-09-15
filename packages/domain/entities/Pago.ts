export interface Pago {
  id: string;
  miembroId: string;
  // Solo poblado por listarPorOrganizacion (denormalizado, igual que
  // Miembro.entrenadorNombre) — listarPorMiembro no lo necesita porque
  // el llamador ya sabe de qué miembro se trata.
  miembroNombre?: string;
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
