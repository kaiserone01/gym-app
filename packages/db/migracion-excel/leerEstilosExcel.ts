// Lee estilos (relleno, color de fuente, negrita, alineación) y encabezados de la hoja del Excel.
// SheetJS no expone los estilos de forma fiable, así que se parsean styles.xml y sheetN.xml directamente.
import { readFile } from "xlsx";
import { COLUMNAS_EXCEL } from "@gym-app/domain/utils/padronExcel";
import type { EncabezadoColumnaPadron } from "@gym-app/domain/entities/MiembroReferencia";

export interface EstiloCelda {
  relleno?: string;
  fuenteRgb?: string;
  negrita?: boolean;
  alineacion?: "left" | "center" | "right";
}
export type EstilosHoja = Map<string, EstiloCelda>; // clave = referencia de celda, ej. "F165"

const BLANCO = "FFFFFF";

function seccion(xml: string, etiqueta: string): string {
  return xml.match(new RegExp(String.raw`<${etiqueta}(?:\s[^>]*)?>([\s\S]*?)</${etiqueta}>`))?.[1] ?? "";
}

function elementos(xml: string, etiqueta: string): string[] {
  const re = new RegExp(String.raw`<${etiqueta}(?:\s[^>]*)?/>|<${etiqueta}(?:\s[^>]*)?>[\s\S]*?</${etiqueta}>`, "g");
  return xml.match(re) ?? [];
}

function atributo(xml: string, nombre: string): string | undefined {
  return xml.match(new RegExp(String.raw`\s${nombre}="([^"]*)"`))?.[1];
}

function rgbSinAlfa(rgb: string | undefined): string | undefined {
  return rgb && /^[0-9a-f]{8}$/i.test(rgb) ? rgb.slice(2).toUpperCase() : undefined;
}

export function parsearEstilos(stylesXml: string, sheetXml: string): EstilosHoja {
  const fuentes = elementos(seccion(stylesXml, "fonts"), "font").map((f): EstiloCelda => {
    const b = f.match(/<b(\s[^>]*?)?\s*\/?>/);
    const val = b ? atributo(b[0], "val") : undefined;
    const color = f.match(/<color\s[^>]*>/)?.[0];
    return {
      ...(b && val !== "0" && val !== "false" ? { negrita: true } : {}),
      ...(rgbSinAlfa(color && atributo(color, "rgb")) ? { fuenteRgb: rgbSinAlfa(color && atributo(color, "rgb")) } : {}),
    };
  });
  const rellenos = elementos(seccion(stylesXml, "fills"), "fill").map((f): string | undefined => {
    if (atributo(f.match(/<patternFill\s[^>]*>/)?.[0] ?? "", "patternType") !== "solid") return undefined;
    const fg = f.match(/<fgColor\s[^>]*>/)?.[0];
    const rgb = rgbSinAlfa(fg && atributo(fg, "rgb"));
    return rgb === BLANCO ? undefined : rgb;
  });
  const estilosXf = elementos(seccion(stylesXml, "cellXfs"), "xf").map((xf): EstiloCelda => {
    const fuente = fuentes[Number(atributo(xf, "fontId") ?? 0)] ?? {};
    const relleno = rellenos[Number(atributo(xf, "fillId") ?? 0)];
    const alin = atributo(xf.match(/<alignment\s[^>]*>/)?.[0] ?? "", "horizontal");
    return {
      ...(relleno ? { relleno } : {}),
      ...fuente,
      ...(alin === "left" || alin === "center" || alin === "right" ? { alineacion: alin } : {}),
    };
  });

  const resultado: EstilosHoja = new Map();
  for (const celda of sheetXml.match(/<c\s[^>]*>/g) ?? []) {
    const ref = atributo(celda, "r");
    const estilo = estilosXf[Number(atributo(celda, "s") ?? 0)];
    if (ref && estilo && Object.keys(estilo).length > 0) resultado.set(ref, estilo);
  }
  return resultado;
}

function texto(contenido: unknown): string {
  return Buffer.from(contenido as Uint8Array).toString("utf8");
}

function abrir(rutaArchivo: string, hoja: string) {
  const libro = readFile(rutaArchivo, { cellStyles: true, bookFiles: true });
  const indice = libro.SheetNames.indexOf(hoja);
  if (indice < 0) throw new Error(`No se encontró "${hoja}" en ${rutaArchivo}`);
  return { libro, indice, hojaLibro: libro.Sheets[hoja] };
}

export function leerEstilosExcel(rutaArchivo: string, hoja = "Hoja1"): EstilosHoja {
  const { libro, indice } = abrir(rutaArchivo, hoja);
  const archivos = (libro as unknown as { files: Record<string, { content: unknown }> }).files;
  const styles = archivos["xl/styles.xml"];
  const sheet = archivos[`xl/worksheets/sheet${indice + 1}.xml`];
  if (!styles || !sheet) throw new Error(`El archivo ${rutaArchivo} no trae styles.xml/sheet${indice + 1}.xml`);
  return parsearEstilos(texto(styles.content), texto(sheet.content));
}

export function leerEncabezadosExcel(rutaArchivo: string, hoja = "Hoja1"): { encabezados: EncabezadoColumnaPadron[]; alturaEncabezadoPx: number } {
  const { hojaLibro } = abrir(rutaArchivo, hoja);
  const columnas = hojaLibro["!cols"] ?? [];
  const encabezados = COLUMNAS_EXCEL.map((col, i) => ({
    col,
    titulo: String(hojaLibro[`${col}3`]?.v ?? "").trim(),
    anchoPx: columnas[i]?.wpx ?? 64,
  }));
  return { encabezados, alturaEncabezadoPx: hojaLibro["!rows"]?.[2]?.hpx ?? 20 };
}
