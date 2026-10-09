import { COLUMNAS_EXCEL } from "@gym-app/domain/utils/padronExcel";
import { SSF, readFile, utils } from "xlsx";
import { leerEstilosExcel } from "./leerEstilosExcel";
import { excelSerialADate } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

const PRIMERA_FILA_DATOS = 4; // fila 3 = encabezado

export function leerFilasExcel(rutaArchivo: string): FilaExcelCruda[] {
  const libro = readFile(rutaArchivo, { cellNF: true }); // cellNF: trae el formato (z) para detectar fechas
  const hoja = libro.Sheets["Hoja1"];
  if (!hoja) {
    throw new Error(`No se encontró "Hoja1" en ${rutaArchivo}`);
  }

  // Última fila real de la hoja (el Excel crece: _hoy.xlsm llega a la 1452).
  const ultimaFila = Number(String(hoja["!ref"]).split(":")[1].replace(/\D/g, ""));

  const estilosHoja = leerEstilosExcel(rutaArchivo); // una sola lectura por archivo
  const filas: FilaExcelCruda[] = [];

  for (let numeroFila = PRIMERA_FILA_DATOS; numeroFila <= ultimaFila; numeroFila++) {
    const celda = (columna: string) => hoja[`${columna}${numeroFila}`];
    const valorCelda = (columna: string): string | number | null => {
      const c = celda(columna);
      if (c === undefined) return null;
      return c.v ?? null;
    };

    // Columnas I–K: una celda numérica con formato de fecha se entrega como aaaa-mm-dd.
    const valorColumnaLibre = (columna: string): string | number | null => {
      const c = celda(columna);
      if (c === undefined || c.v === undefined) return null;
      if (typeof c.v === "number" && c.z && SSF.is_date(String(c.z))) return excelSerialADate(c.v).toISOString().slice(0, 10);
      return c.v;
    };

    const nombre = valorCelda("A");
    if (nombre === null || String(nombre).trim() === "") continue; // fila totalmente en blanco (ej. ~1090)

    filas.push({
      numeroFila,
      nombre: String(nombre),
      status: String(valorCelda("B") ?? ""),
      fNacimiento: valorCelda("C"),
      celular: valorCelda("D"),
      cedula: valorCelda("E"),
      fVenc: valorCelda("F"),
      fechaPago: valorCelda("G"),
      plan: valorCelda("H"),
      colI: valorColumnaLibre("I"),
      colJ: valorColumnaLibre("J"),
      colK: valorColumnaLibre("K"),
      estilos: Object.fromEntries(
        COLUMNAS_EXCEL.flatMap((col) => {
          const estilo = estilosHoja.get(`${col}${numeroFila}`);
          return estilo ? [[col, estilo]] : [];
        })
      ),
    });
  }

  return filas;
}

export function utilsParaTest() {
  return utils;
}
