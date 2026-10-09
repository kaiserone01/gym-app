// packages/db/migracion-excel/padron.ts
// Elegibilidad de filas del Excel para el padrón y reconciliación con lo ya cargado/editado.
// La normalización (plan, fechas) vive en @gym-app/domain/utils/padronExcel. Sin I/O ni Prisma.
import {
  CAMPOS_EDITABLES_PADRON,
  normalizarCamposPadron,
  type CampoEditablePadron,
  type CamposCrudosPadron,
  type NormalizadosPadron,
} from "@gym-app/domain/utils/padronExcel";
import { parsearFechaExcel } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

export type DatosPadron = { cedula: string; numeroFila: number } & CamposCrudosPadron & NormalizadosPadron;
export type ComparablesPadron = Pick<DatosPadron, "cedula" | CampoEditablePadron> & { camposEditados: string[] };

export interface FilaExcluidaPadron {
  numeroFila: number;
  nombre: string;
  motivo: "sin-cedula" | "cedula-repetida";
  cedula: string | null;
}

export interface CambioPadron {
  cedula: string;
  nombre: string;
  campos: { campo: CampoEditablePadron; antes: string | null; despues: string | null }[];
}

// Un campo editado a mano cuyo valor difiere del que trae el Excel.
export interface ConflictoPadron {
  cedula: string;
  nombre: string;
  campo: CampoEditablePadron;
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

  const apariciones = new Map<string, number>();
  for (const { cedula } of conCedula) apariciones.set(cedula, (apariciones.get(cedula) ?? 0) + 1);

  const elegibles: DatosPadron[] = [];
  for (const { fila, cedula } of conCedula) {
    if ((apariciones.get(cedula) ?? 0) > 1) {
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
      colI: null, colJ: null, colK: null, // la Tarea 3 los rellena desde el Excel
    };
    elegibles.push({ cedula, numeroFila: fila.numeroFila, ...crudos, ...normalizarCamposPadron(crudos) });
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

    const campos = CAMPOS_EDITABLES_PADRON.filter((campo) => viejo[campo] !== datos[campo]).map((campo) => ({
      campo,
      antes: viejo[campo],
      despues: datos[campo],
    }));
    if (campos.length === 0) resultado.sinCambios++;
    else resultado.cambios.push({ cedula: nuevo.cedula, nombre: datos.nombre, campos });
    resultado.aEscribir.push(datos);
  }

  return resultado;
}
