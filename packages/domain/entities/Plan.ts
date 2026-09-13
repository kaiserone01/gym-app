export type TipoAccesoPlan = "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";

export interface Plan {
  id: string;
  organizacionId: string;
  nombre: string;
  tipoAcceso: TipoAccesoPlan;
  precioUSD: number;
  activo: boolean;
}

export interface DatosNuevoPlan {
  organizacionId: string;
  nombre: string;
  tipoAcceso: TipoAccesoPlan;
  precioUSD: number;
  // Ignorado si tipoAcceso es TODA_LA_ORGANIZACION. Requerido (no vacío) en
  // cualquier otro caso — CrearPlan lo valida antes de llegar aquí.
  sucursalIds: string[];
}

export interface CambiosPlan {
  nombre?: string;
  precioUSD?: number;
  activo?: boolean;
}
