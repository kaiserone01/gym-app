import { readFile, utils } from "xlsx";
import type { FilaExcelCruda } from "./tipos";

const PRIMERA_FILA_DATOS = 4; // fila 3 = encabezado

export function leerFilasExcel(rutaArchivo: string): FilaExcelCruda[] {
  const libro = readFile(rutaArchivo);
  const hoja = libro.Sheets["Hoja1"];
  if (!hoja) {
    throw new Error(`No se encontró "Hoja1" en ${rutaArchivo}`);
  }

  // Última fila real de la hoja (el Excel crece: _hoy.xlsm llega a la 1452).
  const ultimaFila = Number(String(hoja["!ref"]).split(":")[1].replace(/\D/g, ""));

  const filas: FilaExcelCruda[] = [];

  for (let numeroFila = PRIMERA_FILA_DATOS; numeroFila <= ultimaFila; numeroFila++) {
    const celda = (columna: string) => hoja[`${columna}${numeroFila}`];
    const valorCelda = (columna: string): string | number | null => {
      const c = celda(columna);
      if (c === undefined) return null;
      return c.v ?? null;
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
    });
  }

  return filas;
}

export function utilsParaTest() {
  return utils;
}
