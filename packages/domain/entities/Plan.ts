export type FrecuenciaPago = "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL";

// Declarado acá (junto a FrecuenciaPago) en vez de en ReglaAbono.ts para
// evitar un ciclo de importación: Plan necesita TipoMinimoAbono para sus
// propios campos de mínimo de abono, y ReglaAbono.ts necesita
// FrecuenciaPago para ReglaAbonoPorFrecuencia — declarando ambos tipos
// pequeños acá, ReglaAbono.ts solo importa DESDE Plan.ts, nunca al revés.
export type TipoMinimoAbono = "DIAS" | "PORCENTAJE";

// Duración en días de un ciclo de pago según la frecuencia — usada al
// calcular el vencimiento de la Suscripción (RegistrarPago) y al
// prorratear un cambio de plan (CambiarPlanMiembro, ActualizarFrecuenciaPlan).
export const DURACION_DIAS_POR_FRECUENCIA: Record<FrecuenciaPago, number> = {
  DIARIO: 1,
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
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}

export interface DatosNuevoPlan {
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}

export interface CambiosPlan {
  nombre?: string;
  precioUSD?: number;
  multisede?: boolean;
  activo?: boolean;
  permitePagoParcial?: boolean;
  minimoAbonoTipo?: TipoMinimoAbono | null;
  minimoAbonoValor?: number | null;
}
