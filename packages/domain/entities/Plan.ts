export type FrecuenciaPago =
  | "DIARIO"
  | "SEMANAL"
  | "QUINCENAL"
  | "MENSUAL"
  | "SEMESTRAL"
  | "ANUAL"
  // Sin duración fija asociada — diasCiclo del Plan es la única fuente de
  // verdad (el admin tipeó un número de días a medida, ver FormularioPlan.tsx).
  | "PERSONALIZADO";

// Declarado acá (junto a FrecuenciaPago) en vez de en ReglaAbono.ts para
// evitar un ciclo de importación: Plan necesita TipoMinimoAbono para sus
// propios campos de mínimo de abono, y ReglaAbono.ts necesita
// FrecuenciaPago para ReglaAbonoPorFrecuencia — declarando ambos tipos
// pequeños acá, ReglaAbono.ts solo importa DESDE Plan.ts, nunca al revés.
export type TipoMinimoAbono = "DIAS" | "PORCENTAJE";

export interface Plan {
  id: string;
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  // Duración del ciclo en días — única fuente de verdad de cuánto dura un
  // ciclo de este plan (reemplaza el mapa fijo por frecuencia que existía
  // antes). Para las 6 frecuencias con duración fija coincide siempre con
  // su valor esperado (1/7/15/30/180/365); para PERSONALIZADO es el
  // número que el admin tipeó a mano.
  diasCiclo: number;
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
  diasCiclo: number;
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
