export type FrecuenciaPago = "SEMANAL" | "QUINCENAL" | "MENSUAL";

// Duración en días de un ciclo de pago según la frecuencia — usada al
// calcular el vencimiento de la Suscripción (RegistrarPago) y al
// prorratear un cambio de plan (CambiarPlanMiembro, ActualizarFrecuenciaPlan).
export const DURACION_DIAS_POR_FRECUENCIA: Record<FrecuenciaPago, number> = {
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
};

export interface Plan {
  id: string;
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
  activo: boolean;
}

export interface DatosNuevoPlan {
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
}

export interface CambiosPlan {
  nombre?: string;
  precioUSD?: number;
  multisede?: boolean;
  activo?: boolean;
}
