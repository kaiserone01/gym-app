export interface FilaExcelCruda {
  numeroFila: number; // 1-indexed real row number in the .xlsm (4..1399)
  nombre: string;
  status: string;
  fNacimiento: string | number | null;
  celular: string | number | null;
  cedula: string | number | null;
  fVenc: string | number | null;
  fechaPago: string | number | null;
  plan: string | number | null;
}

export type EstadoSuscripcionNormalizado = "ACTIVA" | "VENCIDA" | null; // null = sin dato (2 filas)

export type ClasificacionPlan =
  | { tipo: "dominante"; valorUSD: number }
  | { tipo: "requiereMapeo"; valorOriginal: string };

export type ResultadoFecha =
  | { tipo: "valida"; fecha: Date }
  | { tipo: "invalida"; motivo: "vacia" | "malformada"; valorOriginal: string | number | null };

export interface FilaNormalizada {
  numeroFila: number;
  nombre: string;
  estado: EstadoSuscripcionNormalizado;
  cedulaOriginal: string | null; // trimmed, null only if truly empty
  celularOriginal: string | null; // trimmed, null only if truly empty — texto libre, incluye no-telefonos como "ESPAÑA"/"Nunca vino"
  plan: ClasificacionPlan;
  fVenc: ResultadoFecha;
  fechaPago:
    | { tipo: "fecha"; fecha: Date }
    | { tipo: "notaTexto"; texto: string }
    | { tipo: "vacia" };
}

export type AccionMapeoPlan = "mapear" | "excluir" | "pendiente";

export interface MapeoPlanEntry {
  valorExcel: string;
  accion: AccionMapeoPlan;
  planNombreDestino?: string;
  precioPlanOverrideUSD?: number;
  planLegacy?: boolean; // if true and accion=mapear, auto-created Plan gets activo:false
}

export interface ReglaCedulaDuplicado {
  cedula: string;
  filaA: number;
  filaB: number;
  fusionar: boolean;
  filaGanadora: number;
}

export interface ReglasCedula {
  vaciaAccion: "placeholder";
  duplicados: ReglaCedulaDuplicado[];
}

export type MotivoFlagRevision =
  | "cedula-placeholder"
  | "fecha-vencimiento-placeholder"
  | "plan-legacy"
  | "pago-aproximado"
  | "plan-aproximado";

export type MotivoExclusion =
  | "sin-mapeo-plan-definido"
  | "status-sin-dato"
  | "duplicado-pendiente-revision"
  | "vencimiento-fuera-de-corte"
  | "error-parseo";

export interface DatosMiembroAMigrar {
  cedula: string;
  nombre: string;
  celular: string | null;
  precioPlanUSD: number;
  planNombre: string;
  planLegacy: boolean;
  precioPlanOriginalUSD?: number; // precio del Excel cuando el plan se aproximó a uno real
  estado: "ACTIVA" | "VENCIDA";
  fechaVencimiento: Date;
  fechaInicio: Date;
  fechaUltimoPago: Date | null;
  pago:
    | { monto: number; metodo: string; fechaPago: Date }
    | null;
}

export type FilaClasificada =
  | { categoria: "migrada"; flags: MotivoFlagRevision[]; datos: DatosMiembroAMigrar; numeroFila: number; filaFusionadaDescartada?: number }
  | { categoria: "excluida"; motivo: MotivoExclusion; numeroFila: number; detalle?: string }
  | { categoria: "ya-existia"; numeroFila: number; cedula: string };
