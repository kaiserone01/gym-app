import { describe, expect, it } from "vitest";
import { filtrarFilasPadron, type FilaFiltrable } from "./filtrarFilasPadron";

const fila = (cedula: string, extra: Partial<FilaFiltrable> = {}): FilaFiltrable => ({
  cedula,
  nombre: `Persona ${cedula}`,
  status: null,
  plan: null,
  fVenc: null,
  miembroId: null,
  resaltado: null,
  ...extra,
});

const FILAS: FilaFiltrable[] = [
  fila("111", { nombre: "Jhon Bret CARPINTERO", status: "Activo", plan: "30", fVenc: "2026-08-19", resaltado: "FFC000" }),
  fila("222", { nombre: "María López", status: "inactivo", plan: "25", fVenc: "2026-09-01", miembroId: "m1" }),
  fila("333", { nombre: "Pedro Carpio", status: null, plan: "25+5", fVenc: "19-082026", resaltado: "92D050" }),
  fila("1114", { nombre: "Ana", fVenc: null }),
];

const cedulas = (filas: FilaFiltrable[]) => filas.map((f) => f.cedula);

describe("filtrarFilasPadron", () => {
  it("sin filtros devuelve todas", () => {
    expect(filtrarFilasPadron(FILAS, {})).toEqual(FILAS);
  });

  it("filtra por cédula (contiene)", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { cedula: "111" }))).toEqual(["111", "1114"]);
  });

  it("filtra por nombre sin distinguir mayúsculas", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { nombre: "carp" }))).toEqual(["111", "333"]);
  });

  it("filtra por status y plan (contiene, sin mayúsculas)", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { status: "ACTIVO" }))).toEqual(["111", "222"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { plan: "25" }))).toEqual(["222", "333"]);
  });

  it("ignora filtros de texto vacíos o con solo espacios", () => {
    expect(filtrarFilasPadron(FILAS, { nombre: "  ", cedula: "" })).toEqual(FILAS);
  });

  it("filtra por rango de vencimiento ISO y deja fuera los no ISO", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { venceDesde: "2026-08-20" }))).toEqual(["222"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { venceHasta: "2026-08-19" }))).toEqual(["111"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { venceDesde: "2026-08-19", venceHasta: "2026-09-01" }))).toEqual(["111", "222"]);
  });

  it("filtra por estado en el sistema", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { estadoEnSistema: "miembro" }))).toEqual(["222"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { estadoEnSistema: "no_miembro" }))).toEqual(["111", "333", "1114"]);
    expect(filtrarFilasPadron(FILAS, { estadoEnSistema: "todos" })).toEqual(FILAS);
  });

  it("filtra por color y por sin color", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { color: "FFC000" }))).toEqual(["111"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { color: "SIN" }))).toEqual(["222", "1114"]);
  });

  it("combina filtros", () => {
    expect(cedulas(filtrarFilasPadron(FILAS, { plan: "25", estadoEnSistema: "no_miembro" }))).toEqual(["333"]);
    expect(cedulas(filtrarFilasPadron(FILAS, { nombre: "carp", color: "SIN" }))).toEqual([]);
  });

  it("conserva el tipo de las filas", () => {
    const extendidas = FILAS.map((f) => ({ ...f, numeroFila: 4 }));
    expect(filtrarFilasPadron(extendidas, { cedula: "222" })[0].numeroFila).toBe(4);
  });
});
