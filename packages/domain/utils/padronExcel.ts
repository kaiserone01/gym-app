// Normalización del padrón de referencia (espejo del Excel). Lógica pura, única fuente de verdad:
// la usan el importador (packages/db) y la edición manual de filas (EditarMiembroReferencia).

// Nombres tal como aparecen en /planes de la organización (precio USD → nombre del Plan).
export const PLANES_PADRON: Record<number, string> = {
  0: "Cortesia",
  8: "Semanal",
  20: "Plan Viejo",
  22: "Corporativo",
  25: "Mensual sin entrenador",
  30: "Mensual con entrenador",
};

export const COLUMNAS_EXCEL = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
export type ColumnaExcel = (typeof COLUMNAS_EXCEL)[number];

export const CAMPOS_EDITABLES_PADRON = ["nombre", "status", "fNacimiento", "celular", "fVenc", "fechaPago", "plan", "colI", "colJ", "colK"] as const;
export type CampoEditablePadron = (typeof CAMPOS_EDITABLES_PADRON)[number];

export interface CamposCrudosPadron {
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
}

export type CambiosCrudosPadron = { nombre?: string } & Partial<Record<Exclude<CampoEditablePadron, "nombre">, string | null>>;

export interface CambiosEdicionPadron extends CambiosCrudosPadron {
  resaltado?: string | null; // null = quitar el color
}

export interface EstiloCeldaPadron { b?: true; c?: string; a?: "left" | "center" | "right" }
export type EstilosPadron = Partial<Record<ColumnaExcel, EstiloCeldaPadron>>;

export const PALETA_RESALTADO: { nombre: string; hex: string }[] = [
  { nombre: "amarillo", hex: "FFFF00" },
  { nombre: "naranja", hex: "FFC000" },
  { nombre: "verde", hex: "92D050" },
  { nombre: "celeste", hex: "00B0F0" },
  { nombre: "rosado", hex: "FF99CC" },
  { nombre: "rojo claro", hex: "FF7C80" },
];

export function esColorResaltadoValido(hex: string): boolean {
  return PALETA_RESALTADO.some((c) => c.hex === hex);
}

export interface NormalizadosPadron {
  fechaVencimiento: Date | null;
  fechaUltimoPago: Date | null;
  fechaNacimiento: Date | null;
  planNombre: string | null;
  precioPlanUSD: number | null;
}

export function resolverPlanPadron(valor: string | number | null): { planNombre: string | null; precioPlanUSD: number | null } {
  const texto = valor === null ? "" : String(valor).trim();
  const precio = texto === "25+5" ? 30 : /^\d+(\.\d+)?\*?$/.test(texto) ? Number(texto.replace("*", "")) : null;
  if (precio === null) return { planNombre: null, precioPlanUSD: null };
  return { planNombre: PLANES_PADRON[precio] ?? null, precioPlanUSD: precio };
}

function fechaReal(anio: number, mes: number, dia: number): Date | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? fecha : null;
}

// aaaa-mm-dd o dd-mm-aaaa con día real; cualquier otra cosa (texto, mal escrita, vacía) → null.
export function fechaDesdeTextoPadron(texto: string | null): Date | null {
  const t = texto?.trim() ?? "";
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return fechaReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return fechaReal(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

export function normalizarCamposPadron(c: CamposCrudosPadron): NormalizadosPadron {
  return {
    fechaVencimiento: fechaDesdeTextoPadron(c.fVenc),
    fechaUltimoPago: fechaDesdeTextoPadron(c.fechaPago),
    fechaNacimiento: fechaDesdeTextoPadron(c.fNacimiento),
    ...resolverPlanPadron(c.plan),
  };
}
