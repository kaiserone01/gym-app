import { describe, expect, test } from "vitest";
import { prepararPadron, reconciliarPadron, type ComparablesPadron, type DatosPadron } from "./padron";
import type { FilaExcelCruda } from "./tipos";

function fila(sobrescribir: Partial<FilaExcelCruda>): FilaExcelCruda {
  return {
    numeroFila: 4, nombre: "Ana Pérez", status: "ACTIVO", fNacimiento: null, celular: "0414-1112233",
    cedula: "12345678", fVenc: 46296, // serial de Excel = 2026-10-01
    fechaPago: null, plan: 30,
    ...sobrescribir,
  };
}

describe("prepararPadron", () => {
  test("fila normal: crudos como texto y fechas normalizadas (serial → ISO)", () => {
    const { elegibles, excluidas } = prepararPadron([fila({})]);
    expect(excluidas).toEqual([]);
    const [d] = elegibles;
    expect(d.cedula).toBe("12345678");
    expect(d.fVenc).toBe("2026-10-01");
    expect(d.fechaVencimiento?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(d.plan).toBe("30");
    expect(d.planNombre).toBe("Mensual con entrenador");
    expect(d.precioPlanUSD).toBe(30);
  });
  test("cédula escrita como número y con espacios se recorta", () => {
    const { elegibles } = prepararPadron([fila({ cedula: 12345678 }), fila({ numeroFila: 5, cedula: " 87654321 " })]);
    expect(elegibles.map((e) => e.cedula)).toEqual(["12345678", "87654321"]);
  });
  test("sin cédula: vacía, null o sin dígitos (S/C, G) se excluye", () => {
    const { elegibles, excluidas } = prepararPadron([
      fila({ numeroFila: 4, cedula: null }), fila({ numeroFila: 5, cedula: "   " }),
      fila({ numeroFila: 6, cedula: "S/C" }), fila({ numeroFila: 7, cedula: "G" }),
    ]);
    expect(elegibles).toEqual([]);
    expect(excluidas.map((e) => [e.numeroFila, e.motivo])).toEqual([[4, "sin-cedula"], [5, "sin-cedula"], [6, "sin-cedula"], [7, "sin-cedula"]]);
  });
  test("cédula repetida sin una única fila activa: se excluyen TODAS las filas con esa cédula", () => {
    const { elegibles, excluidas } = prepararPadron([
      fila({ numeroFila: 4, cedula: "111" }), fila({ numeroFila: 5, cedula: "222" }), fila({ numeroFila: 6, cedula: "111" }),
    ]);
    expect(elegibles.map((e) => e.cedula)).toEqual(["222"]);
    expect(excluidas.map((e) => [e.numeroFila, e.motivo, e.cedula])).toEqual([[4, "cedula-repetida", "111"], [6, "cedula-repetida", "111"]]);
  });
  test("cédula repetida con una única fila ACTIVO: entra esa y se excluye la otra", () => {
    const { elegibles, excluidas } = prepararPadron([
      fila({ numeroFila: 4, cedula: "111", status: "ACTIVO" }), fila({ numeroFila: 6, cedula: "111", status: " S/V" }),
      fila({ numeroFila: 7, cedula: "222", status: "S/V" }), fila({ numeroFila: 8, cedula: "222", status: "ACTIVO" }),
    ]);
    expect(elegibles.map((e) => [e.cedula, e.numeroFila])).toEqual([["111", 4], ["222", 8]]);
    expect(excluidas.map((e) => [e.numeroFila, e.motivo])).toEqual([[6, "cedula-repetida"], [7, "cedula-repetida"]]);
  });
  test("cédula repetida con dos filas ACTIVO: no se puede elegir, se excluyen ambas", () => {
    const { elegibles, excluidas } = prepararPadron([fila({ numeroFila: 4, cedula: "111" }), fila({ numeroFila: 5, cedula: "111" })]);
    expect(elegibles).toEqual([]);
    expect(excluidas).toHaveLength(2);
  });
  test("cédula alfanumérica con dígitos entra", () => {
    expect(prepararPadron([fila({ cedula: "E-3880506" })]).elegibles[0].cedula).toBe("E-3880506");
  });
  test("fecha de vencimiento mal escrita: crudo intacto y fecha normalizada null", () => {
    const [d] = prepararPadron([fila({ fVenc: "19-082026" })]).elegibles;
    expect(d.fVenc).toBe("19-082026");
    expect(d.fechaVencimiento).toBeNull();
  });
  test("fecha de pago que es una nota de texto: no es fecha", () => {
    const [d] = prepararPadron([fila({ fechaPago: "efectivo" })]).elegibles;
    expect(d.fechaPago).toBe("efectivo");
    expect(d.fechaUltimoPago).toBeNull();
  });
});

describe("prepararPadron: columnas I-K, resaltado y estilos", () => {
  test("colI-K recortadas (vacío → null), resaltado de la columna A y estilos sin relleno", () => {
    const [d] = prepararPadron([
      fila({
        colI: " nota ", colJ: 3, colK: "  ",
        estilos: {
          A: { relleno: "FFC000", negrita: true, fuenteRgb: "FF0000", alineacion: "left" },
          B: { relleno: "92D050" },
          C: { alineacion: "center" },
        },
      }),
    ]).elegibles;
    expect([d.colI, d.colJ, d.colK]).toEqual(["nota", "3", null]);
    expect(d.resaltado).toBe("FFC000");
    expect(d.estilos).toEqual({ A: { b: true, c: "FF0000", a: "left" }, C: { a: "center" } });
  });
  test("sin estilos: resaltado y estilos null; relleno en otra columna no resalta", () => {
    expect(prepararPadron([fila({})]).elegibles[0]).toMatchObject({ colI: null, resaltado: null, estilos: null });
    const [d] = prepararPadron([fila({ estilos: { B: { relleno: "FFC000" } } })]).elegibles;
    expect(d.resaltado).toBeNull();
    expect(d.estilos).toBeNull();
  });
});

describe("reconciliarPadron", () => {
  const base: DatosPadron = prepararPadron([fila({})]).elegibles[0];
  const existente = (sobre: Partial<ComparablesPadron> = {}): ComparablesPadron => ({ ...base, camposEditados: [], resaltadoEditado: false, ...sobre });
  const nuevoConColor = { ...base, colI: "nota", resaltado: "FFC000" };

  test("cédula nueva = alta y se escribe", () => {
    const r = reconciliarPadron(new Map(), [base]);
    expect(r.altas).toEqual([base]);
    expect(r.aEscribir).toEqual([base]);
    expect(r.cambios).toEqual([]);
    expect(r.conflictos).toEqual([]);
  });
  test("sin diferencias = sin cambios (aunque cambie el número de fila), pero se refresca la fila", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente()]]), [{ ...base, numeroFila: 99 }]);
    expect(r.sinCambios).toBe(1);
    expect(r.cambios).toEqual([]);
    expect(r.aEscribir[0].numeroFila).toBe(99);
  });
  test("reporta campo, valor anterior y nuevo", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente({ fVenc: "2026-09-01", plan: "25" })]]), [base]);
    expect(r.cambios).toEqual([
      { cedula: base.cedula, nombre: base.nombre, campos: [
        { campo: "fVenc", antes: "2026-09-01", despues: "2026-10-01" },
        { campo: "plan", antes: "25", despues: "30" },
      ] },
    ]);
  });
  test("un campo editado a mano se respeta, se recalculan las normalizadas y se reporta el conflicto", () => {
    const editado = existente({ fVenc: "2026-12-01", camposEditados: ["fVenc"] });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [base]); // el Excel sigue trayendo 2026-10-01
    expect(r.aEscribir[0].fVenc).toBe("2026-12-01");
    expect(r.aEscribir[0].fechaVencimiento?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.conflictos).toEqual([{ cedula: base.cedula, nombre: base.nombre, campo: "fVenc", excel: "2026-10-01", padron: "2026-12-01" }]);
    expect(r.cambios).toEqual([]);
  });
  test("si el Excel ya coincide con lo editado no hay conflicto; los campos no editados sí se actualizan", () => {
    const editado = existente({ fVenc: "2026-10-01", plan: "25", camposEditados: ["fVenc"] });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [base]);
    expect(r.conflictos).toEqual([]);
    expect(r.aEscribir[0].plan).toBe("30");
    expect(r.cambios[0].campos).toEqual([{ campo: "plan", antes: "25", despues: "30" }]);
  });
  test("colI editado a mano se respeta y se reporta el conflicto", () => {
    const editado = existente({ colI: "mía", camposEditados: ["colI"] });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [nuevoConColor]);
    expect(r.aEscribir[0].colI).toBe("mía");
    expect(r.conflictos).toEqual([{ cedula: base.cedula, nombre: base.nombre, campo: "colI", excel: "nota", padron: "mía" }]);
  });
  test("resaltado editado a mano se respeta y se reporta el conflicto", () => {
    const editado = existente({ resaltado: "92D050", resaltadoEditado: true });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [nuevoConColor]);
    expect(r.aEscribir[0].resaltado).toBe("92D050");
    expect(r.conflictos).toEqual([{ cedula: base.cedula, nombre: base.nombre, campo: "resaltado", excel: "FFC000", padron: "92D050" }]);
  });
  test("resaltado editado igual al del Excel: sin conflicto", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente({ resaltado: "FFC000", resaltadoEditado: true })]]), [nuevoConColor]);
    expect(r.conflictos).toEqual([]);
  });
  test("resaltado no editado se actualiza y aparece en cambios", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente({ colI: "nota" })]]), [nuevoConColor]);
    expect(r.aEscribir[0].resaltado).toBe("FFC000");
    expect(r.cambios[0].campos).toEqual([{ campo: "resaltado", antes: null, despues: "FFC000" }]);
    expect(r.conflictos).toEqual([]);
  });
  test("mismos valores incluyendo colI-K y resaltado: sin cambios", () => {
    const r = reconciliarPadron(new Map([[nuevoConColor.cedula, existente({ colI: "nota", resaltado: "FFC000" })]]), [nuevoConColor]);
    expect(r.sinCambios).toBe(1);
  });
  test("fila nueva: alta con colI-K, resaltado y estilos", () => {
    const [d] = prepararPadron([fila({ colK: "x", estilos: { A: { relleno: "92D050", negrita: true } } })]).elegibles;
    const r = reconciliarPadron(new Map(), [d]);
    expect(r.altas[0]).toMatchObject({ colK: "x", resaltado: "92D050", estilos: { A: { b: true } } });
  });
  test("los estilos del Excel se conservan aunque haya ediciones", () => {
    const [d] = prepararPadron([fila({ estilos: { A: { negrita: true } } })]).elegibles;
    const r = reconciliarPadron(new Map([[d.cedula, existente({ resaltado: "92D050", resaltadoEditado: true })]]), [d]);
    expect(r.aEscribir[0].estilos).toEqual({ A: { b: true } });
  });
});
