// Filtros del espejo del Excel, en el navegador sobre el arreglo completo de filas.
export interface FiltrosFilasPadron {
  cedula?: string;
  nombre?: string;
  status?: string;
  plan?: string;
  venceDesde?: string; // aaaa-mm-dd
  venceHasta?: string; // aaaa-mm-dd
  estadoEnSistema?: "todos" | "no_miembro" | "miembro";
  color?: string; // hex; "SIN" = sin color
}

export interface FilaFiltrable {
  cedula: string;
  nombre: string;
  status: string | null;
  plan: string | null;
  fVenc: string | null;
  miembroId: string | null;
  resaltado: string | null;
}

const ES_ISO = /^\d{4}-\d{2}-\d{2}$/;

function contiene(valor: string | null, buscado: string | undefined): boolean {
  const b = buscado?.trim().toLowerCase();
  return !b || (valor ?? "").toLowerCase().includes(b);
}

export function filtrarFilasPadron<T extends FilaFiltrable>(filas: T[], f: FiltrosFilasPadron): T[] {
  const desde = f.venceDesde && ES_ISO.test(f.venceDesde) ? f.venceDesde : null;
  const hasta = f.venceHasta && ES_ISO.test(f.venceHasta) ? f.venceHasta : null;
  return filas.filter((fila) => {
    if (!contiene(fila.cedula, f.cedula) || !contiene(fila.nombre, f.nombre)) return false;
    if (!contiene(fila.status, f.status) || !contiene(fila.plan, f.plan)) return false;
    if (desde || hasta) {
      // Las fechas ISO se comparan como texto; fVenc no ISO (texto libre) queda fuera.
      if (!fila.fVenc || !ES_ISO.test(fila.fVenc)) return false;
      if (desde && fila.fVenc < desde) return false;
      if (hasta && fila.fVenc > hasta) return false;
    }
    if (f.estadoEnSistema === "miembro" && fila.miembroId === null) return false;
    if (f.estadoEnSistema === "no_miembro" && fila.miembroId !== null) return false;
    if (f.color && (f.color === "SIN" ? fila.resaltado !== null : fila.resaltado !== f.color)) return false;
    return true;
  });
}
