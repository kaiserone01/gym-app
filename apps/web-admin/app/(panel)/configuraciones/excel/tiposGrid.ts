import type { HojaPadron, MiembroReferencia } from "@gym-app/domain/entities/MiembroReferencia";
import type { ColumnaExcel, EstilosPadron } from "@gym-app/domain/utils/padronExcel";

// Fila de la cuadrícula del menú Excel: datos planos (sin Date) que viajan del servidor al cliente.
export interface FilaGrid {
  cedula: string;
  numeroFila: number;
  nombre: string;
  status: string | null;
  fNacimiento: string | null;
  celular: string | null;
  fVenc: string | null;
  fechaPago: string | null;
  plan: string | null;
  colI: string | null;
  colJ: string | null;
  colK: string | null;
  estilos: EstilosPadron | null;
  resaltado: string | null;
  camposEditados: string[];
  miembroId: string | null;
}

export type CampoCeldaGrid = "nombre" | "status" | "fNacimiento" | "celular" | "cedula" | "fVenc" | "fechaPago" | "plan" | "colI" | "colJ" | "colK";

// Columna del Excel → campo de la fila. La cédula (E) se muestra pero no se edita.
export const COLUMNAS_GRID: { col: ColumnaExcel; campo: CampoCeldaGrid; editable: boolean }[] = [
  { col: "A", campo: "nombre", editable: true },
  { col: "B", campo: "status", editable: true },
  { col: "C", campo: "fNacimiento", editable: true },
  { col: "D", campo: "celular", editable: true },
  { col: "E", campo: "cedula", editable: false },
  { col: "F", campo: "fVenc", editable: true },
  { col: "G", campo: "fechaPago", editable: true },
  { col: "H", campo: "plan", editable: true },
  { col: "I", campo: "colI", editable: true },
  { col: "J", campo: "colJ", editable: true },
  { col: "K", campo: "colK", editable: true },
];

// Si la sede aún no se reimportó con títulos y anchos del archivo.
export const HOJA_POR_DEFECTO: HojaPadron = {
  encabezados: [
    { col: "A", titulo: "NOMBRE", anchoPx: 240 },
    { col: "B", titulo: "STATUS", anchoPx: 90 },
    { col: "C", titulo: "F/NACIMIENTO", anchoPx: 110 },
    { col: "D", titulo: "CELULAR", anchoPx: 120 },
    { col: "E", titulo: "CEDULA", anchoPx: 100 },
    { col: "F", titulo: "F/VENC", anchoPx: 100 },
    { col: "G", titulo: "FECHA PAGO", anchoPx: 100 },
    { col: "H", titulo: "PLAN", anchoPx: 70 },
    { col: "I", titulo: "", anchoPx: 70 },
    { col: "J", titulo: "", anchoPx: 150 },
    { col: "K", titulo: "", anchoPx: 80 },
  ],
  alturaEncabezadoPx: 28,
  archivoOrigen: "",
};

export function aFilaGrid(ref: MiembroReferencia, miembroId: string | null): FilaGrid {
  return {
    cedula: ref.cedula,
    numeroFila: ref.numeroFila,
    nombre: ref.nombre,
    status: ref.status,
    fNacimiento: ref.fNacimiento,
    celular: ref.celular,
    fVenc: ref.fVenc,
    fechaPago: ref.fechaPago,
    plan: ref.plan,
    colI: ref.colI,
    colJ: ref.colJ,
    colK: ref.colK,
    estilos: ref.estilos,
    resaltado: ref.resaltado,
    camposEditados: ref.camposEditados,
    miembroId,
  };
}
