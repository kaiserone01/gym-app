// Fila del padrón de referencia (espejo del Excel). No es un miembro del sistema.
export interface MiembroReferencia {
  id: string;
  organizacionId: string;
  sucursalId: string;
  cedula: string;
  numeroFila: number;
  nombre: string;
  status: string | null;
  fNacimiento: string | null;
  celular: string | null;
  fVenc: string | null;
  fechaPago: string | null;
  plan: string | null;
  fechaVencimiento: Date | null;
  fechaUltimoPago: Date | null;
  fechaNacimiento: Date | null;
  planNombre: string | null;
  precioPlanUSD: number | null;
  archivoOrigen: string;
  importadoAt: Date;
  camposEditados: string[]; // columnas crudas editadas a mano desde el menú Excel
  editadoAt: Date | null;
  editadoPor: string | null;
}

export interface FiltrosReferencia {
  cedula?: string;
  nombre?: string;
  status?: string;
  plan?: string;
  venceDesde?: Date;
  venceHasta?: Date;
  estadoEnSistema?: "todos" | "no_miembro" | "miembro";
  pagina: number;
  porPagina: number;
}

// Fila del padrón con el id del Miembro que ya la ocupa (misma cédula), si lo hay.
export type FilaReferenciaConEstado = MiembroReferencia & { miembroId: string | null };
