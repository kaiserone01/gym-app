// packages/db/migracion-excel/padron.ts
// Elegibilidad de filas del Excel para el padrón y reconciliación con lo ya cargado/editado.
// La normalización (plan, fechas) vive en @gym-app/domain/utils/padronExcel. Sin I/O ni Prisma.
import {
  CAMPOS_EDITABLES_PADRON,
  COLUMNAS_EXCEL,
  estaActivoEnPadron,
  normalizarCamposPadron,
  type CampoEditablePadron,
  type CamposCrudosPadron,
  type EstilosPadron,
  type NormalizadosPadron,
} from "@gym-app/domain/utils/padronExcel";
import { parsearFechaExcel } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

export type DatosPadron = { cedula: string; numeroFila: number; estilos: EstilosPadron | null; resaltado: string | null } & CamposCrudosPadron &
  NormalizadosPadron;
export type ComparablesPadron = Pick<DatosPadron, "cedula" | CampoEditablePadron | "resaltado"> & {
  camposEditados: string[];
  resaltadoEditado: boolean;
};

export interface FilaExcluidaPadron {
  numeroFila: number;
  nombre: string;
  motivo: "sin-cedula" | "cedula-repetida";
  cedula: string | null;
}

export interface CambioPadron {
  cedula: string;
  nombre: string;
  campos: { campo: CampoEditablePadron | "resaltado"; antes: string | null; despues: string | null }[];
}

// Un campo editado a mano cuyo valor difiere del que trae el Excel.
export interface ConflictoPadron {
  cedula: string;
  nombre: string;
  campo: CampoEditablePadron | "resaltado";
  excel: string | null;
  padron: string | null;
}

export interface ResultadoPadron {
  aEscribir: DatosPadron[]; // todo lo que se upsertea (altas + existentes con las ediciones ya aplicadas)
  altas: DatosPadron[];
  cambios: CambioPadron[];
  conflictos: ConflictoPadron[];
  sinCambios: number;
}

function textoCrudo(valor: string | number | null): string | null {
  if (valor === null) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

// Fecha guardada como serial o dd-mm-aaaa válido → aaaa-mm-dd; cualquier otra cosa se deja tal cual.
function textoColumnaFecha(valor: string | number | null): string | null {
  const fecha = parsearFechaExcel(valor);
  return fecha.tipo === "valida" ? fecha.fecha.toISOString().slice(0, 10) : textoCrudo(valor);
}

// Por columna solo lo que no es relleno (el relleno de la fila va aparte, en `resaltado`); null si no hay nada.
function estilosPadron(estilos: FilaExcelCruda["estilos"]): EstilosPadron | null {
  const resultado: EstilosPadron = {};
  for (const col of COLUMNAS_EXCEL) {
    const e = estilos?.[col];
    if (!e) continue;
    const estilo = { ...(e.negrita ? { b: true as const } : {}), ...(e.fuenteRgb ? { c: e.fuenteRgb } : {}), ...(e.alineacion ? { a: e.alineacion } : {}) };
    if (Object.keys(estilo).length > 0) resultado[col] = estilo;
  }
  return Object.keys(resultado).length > 0 ? resultado : null;
}

export function prepararPadron(filas: FilaExcelCruda[]): { elegibles: DatosPadron[]; excluidas: FilaExcluidaPadron[] } {
  const excluidas: FilaExcluidaPadron[] = [];
  const conCedula: { fila: FilaExcelCruda; cedula: string }[] = [];

  for (const fila of filas) {
    const cedula = textoCrudo(fila.cedula);
    if (cedula === null || !/\d/.test(cedula)) {
      excluidas.push({ numeroFila: fila.numeroFila, nombre: fila.nombre.trim(), motivo: "sin-cedula", cedula });
      continue;
    }
    conCedula.push({ fila, cedula });
  }

  const porCedula = new Map<string, { fila: FilaExcelCruda; cedula: string }[]>();
  for (const item of conCedula) porCedula.set(item.cedula, [...(porCedula.get(item.cedula) ?? []), item]);

  // Cédula repetida: se conserva la fila que el Excel marca como activa si es la única; si ninguna o varias lo
  // son, no hay forma de elegir y se excluyen todas. Las demás de ese grupo se excluyen.
  const ganadora = new Map<string, FilaExcelCruda>();
  for (const [cedula, grupo] of porCedula) {
    if (grupo.length === 1) ganadora.set(cedula, grupo[0].fila);
    else {
      const activas = grupo.filter(({ fila }) => estaActivoEnPadron(textoCrudo(fila.status)));
      if (activas.length === 1) ganadora.set(cedula, activas[0].fila);
    }
  }

  const elegibles: DatosPadron[] = [];
  for (const { fila, cedula } of conCedula) {
    if (ganadora.get(cedula) !== fila) {
      excluidas.push({ numeroFila: fila.numeroFila, nombre: fila.nombre.trim(), motivo: "cedula-repetida", cedula });
      continue;
    }
    const crudos: CamposCrudosPadron = {
      nombre: fila.nombre.trim(),
      status: textoCrudo(fila.status),
      fNacimiento: textoColumnaFecha(fila.fNacimiento),
      celular: textoCrudo(fila.celular),
      fVenc: textoColumnaFecha(fila.fVenc),
      fechaPago: textoColumnaFecha(fila.fechaPago),
      plan: textoCrudo(fila.plan),
      colI: textoCrudo(fila.colI ?? null),
      colJ: textoCrudo(fila.colJ ?? null),
      colK: textoCrudo(fila.colK ?? null),
    };
    elegibles.push({
      cedula,
      numeroFila: fila.numeroFila,
      estilos: estilosPadron(fila.estilos),
      resaltado: fila.estilos?.A?.relleno ?? null,
      ...crudos,
      ...normalizarCamposPadron(crudos),
    });
  }

  excluidas.sort((a, b) => a.numeroFila - b.numeroFila);
  return { elegibles, excluidas };
}

export function reconciliarPadron(existentes: Map<string, ComparablesPadron>, nuevos: DatosPadron[]): ResultadoPadron {
  const resultado: ResultadoPadron = { aEscribir: [], altas: [], cambios: [], conflictos: [], sinCambios: 0 };

  for (const nuevo of nuevos) {
    const viejo = existentes.get(nuevo.cedula);
    if (!viejo) {
      resultado.altas.push(nuevo);
      resultado.aEscribir.push(nuevo);
      continue;
    }

    // Lo editado a mano se conserva; el resto se toma del Excel y las normalizadas se recalculan.
    const editados = CAMPOS_EDITABLES_PADRON.filter((campo) => viejo.camposEditados.includes(campo));
    let datos = nuevo;
    if (editados.length > 0) {
      const crudos: CamposCrudosPadron = { ...nuevo };
      for (const campo of editados) {
        if (nuevo[campo] !== viejo[campo]) {
          resultado.conflictos.push({ cedula: nuevo.cedula, nombre: viejo.nombre, campo, excel: nuevo[campo], padron: viejo[campo] });
        }
        (crudos as unknown as Record<string, string | null>)[campo] = viejo[campo];
      }
      datos = { ...nuevo, ...crudos, ...normalizarCamposPadron(crudos) };
    }

    // El color editado a mano se conserva igual que un campo de texto.
    if (viejo.resaltadoEditado) {
      if (nuevo.resaltado !== viejo.resaltado) {
        resultado.conflictos.push({ cedula: nuevo.cedula, nombre: viejo.nombre, campo: "resaltado", excel: nuevo.resaltado, padron: viejo.resaltado });
      }
      datos = { ...datos, resaltado: viejo.resaltado };
    }

    const campos = [...CAMPOS_EDITABLES_PADRON, "resaltado" as const]
      .filter((campo) => viejo[campo] !== datos[campo])
      .map((campo) => ({ campo, antes: viejo[campo], despues: datos[campo] }));
    if (campos.length === 0) resultado.sinCambios++;
    else resultado.cambios.push({ cedula: nuevo.cedula, nombre: datos.nombre, campos });
    resultado.aEscribir.push(datos);
  }

  return resultado;
}
