import { describe, expect, test } from "vitest";
import path from "node:path";
import { leerEncabezadosExcel, leerEstilosExcel, parsearEstilos } from "./leerEstilosExcel";

const ESTILOS = (fonts: string, fills: string, xfs: string) =>
  `<styleSheet><fonts count="3">${fonts}</fonts><fills count="3">${fills}</fills><cellXfs count="9">${xfs}</cellXfs></styleSheet>`;
const FONTS = `<font><sz val="11"/><color theme="1"/></font><font><b/><color rgb="FFFF0000"/></font><font><b val="0"/></font>`;
const FILLS = `<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor theme="0"/></patternFill></fill>`;
const XFS = [
  `<xf fontId="0" fillId="0"/>`,
  `<xf fontId="0" fillId="1"/>`,
  `<xf fontId="0" fillId="2"/>`,
  `<xf fontId="1" fillId="0"><alignment horizontal="center"/></xf>`,
  `<xf fontId="2" fillId="0"/>`,
  `<xf fontId="0" fillId="0"><alignment horizontal="justify"/></xf>`,
].join("");
const hoja = (celdas: string) => `<worksheet><sheetData><row r="4">${celdas}</row></sheetData></worksheet>`;
const estilos = (celdas: string) => parsearEstilos(ESTILOS(FONTS, FILLS, XFS), hoja(celdas));

describe("parsearEstilos", () => {
  test("relleno sólido rgb → hex sin alfa y en mayúsculas", () => {
    expect(estilos(`<c r="A4" s="1" t="s"><v>0</v></c>`).get("A4")).toEqual({ relleno: "FFC000" });
    const minus = ESTILOS(FONTS, FILLS.replace("FFFFC000", "ff92d050"), XFS);
    expect(parsearEstilos(minus, hoja(`<c r="A4" s="1"/>`)).get("A4")).toEqual({ relleno: "92D050" });
  });
  test("relleno theme o blanco se ignora", () => {
    expect(estilos(`<c r="A4" s="2"/>`).has("A4")).toBe(false);
    const blanco = ESTILOS(FONTS, FILLS.replace("FFFFC000", "FFFFFFFF"), XFS);
    expect(parsearEstilos(blanco, hoja(`<c r="A4" s="1"/>`)).has("A4")).toBe(false);
  });
  test("negrita, color de fuente y alineación", () => {
    expect(estilos(`<c r="B4" s="3"/>`).get("B4")).toEqual({ fuenteRgb: "FF0000", negrita: true, alineacion: "center" });
  });
  test("<b val=\"0\"/> no es negrita y la fuente theme no aporta color", () => {
    expect(estilos(`<c r="B4" s="4"/>`).has("B4")).toBe(false);
  });
  test("alineación distinta de left/center/right se ignora; celda sin atributos no aparece", () => {
    const e = estilos(`<c r="C4" s="5"/><c r="D4" s="0"/><c r="E4"/>`);
    expect(e.size).toBe(0);
  });
});

describe("archivo real", () => {
  const ruta = path.resolve(__dirname, "../../../docs/xls/DATA ADRENALINA_hoy.xlsm");
  test("encabezados de la fila 3 y rellenos", () => {
    const { encabezados, alturaEncabezadoPx } = leerEncabezadosExcel(ruta);
    expect(encabezados.map((e) => e.titulo).slice(0, 8)).toEqual(["NOMBRE", "STATUS", "F/NACIMIENTO", "CELULAR", "CEDULA", "F/VENC", "FECHA PAGO", "PLAN"]);
    expect(encabezados).toHaveLength(11);
    expect(encabezados[8].titulo).toBe("");
    expect(alturaEncabezadoPx).toBeGreaterThan(20);
    expect([...leerEstilosExcel(ruta).values()].some((s) => s.relleno === "FFC000")).toBe(true);
  }, 30000);
});
