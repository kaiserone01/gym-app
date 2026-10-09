import type { ColumnaExcel } from "@gym-app/domain/utils/padronExcel";
import type { EstiloCelda } from "./leerEstilosExcel";

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
  // Columnas sin título del Excel (I–K) y estilos por columna; opcionales para no romper quien arma filas a mano.
  colI?: string | number | null;
  colJ?: string | number | null;
  colK?: string | number | null;
  estilos?: Partial<Record<ColumnaExcel, EstiloCelda>>;
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
