import { describe, expect, test } from "vitest";
import { analizarMp4, ErrorMp4, type LectorBytes } from "./mp4";

const texto = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const fijo = (n: number) => u32(Math.round(n * 65536));
const ceros = (n: number) => new Array<number>(n).fill(0);
const caja = (tipo: string, ...partes: number[][]): number[] => {
  const cuerpo = partes.flat();
  return [...u32(8 + cuerpo.length), ...texto(tipo), ...cuerpo];
};
// Matriz 3x3 de transformación: a b u / c d v / x y w, con w en punto fijo 2.30.
const matriz = (a: number, b: number, c: number, d: number) => [
  ...fijo(a), ...fijo(b), ...u32(0), ...fijo(c), ...fijo(d), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000),
];
const ROT = { 0: matriz(1, 0, 0, 1), 90: matriz(0, 1, -1, 0), 180: matriz(-1, 0, 0, -1), 270: matriz(0, -1, 1, 0) };

interface OpcionesPista { ancho?: number; alto?: number; rot?: 0 | 90 | 180 | 270; manejador?: string; version?: 0 | 1 }
function pista(codec: string, o: OpcionesPista = {}): number[] {
  const { ancho = 1920, alto = 1080, rot = 0, manejador = "vide", version = 0 } = o;
  const previo = version === 1 ? [1, 0, 0, 0, ...ceros(48)] : [0, 0, 0, 0, ...ceros(36)];
  return caja(
    "trak",
    caja("tkhd", previo, ROT[rot], fijo(ancho), fijo(alto)),
    caja(
      "mdia",
      caja("hdlr", [0, 0, 0, 0], [0, 0, 0, 0], texto(manejador), ceros(13)),
      caja("minf", caja("stbl", caja("stsd", [0, 0, 0, 0], [0, 0, 0, 1], caja(codec, ceros(8)))))
    )
  );
}
function archivo(pistas: number[][], moovAlFinal = true): Uint8Array {
  const ftyp = caja("ftyp", texto("isom"), u32(0), texto("isom"));
  const mdat = caja("mdat", ceros(100));
  const moov = caja("moov", ...pistas);
  return Uint8Array.from(moovAlFinal ? [...ftyp, ...mdat, ...moov] : [...ftyp, ...moov, ...mdat]);
}
const lector = (bytes: Uint8Array): LectorBytes => async (desde, largo) => bytes.slice(desde, desde + largo);
const analizar = (bytes: Uint8Array) => analizarMp4(lector(bytes), bytes.length);

describe("analizarMp4", () => {
  test("H.264 horizontal sin rotación", async () => {
    expect(await analizar(archivo([pista("avc1")]))).toEqual({ codec: "avc1", anchoMostrado: 1920, altoMostrado: 1080, rotacion: 0 });
  });

  test("lee el moov también cuando está al inicio (faststart)", async () => {
    expect((await analizar(archivo([pista("avc1")], false))).codec).toBe("avc1");
  });

  test("rotación de 90°: las dimensiones mostradas se intercambian", async () => {
    expect(await analizar(archivo([pista("avc1", { rot: 90 })]))).toEqual({ codec: "avc1", anchoMostrado: 1080, altoMostrado: 1920, rotacion: 90 });
  });

  test("rotación de 270°: también se intercambian", async () => {
    const info = await analizar(archivo([pista("avc1", { rot: 270 })]));
    expect(info).toMatchObject({ anchoMostrado: 1080, altoMostrado: 1920, rotacion: 270 });
  });

  test("rotación de 180°: no cambia las dimensiones", async () => {
    expect(await analizar(archivo([pista("avc1", { rot: 180 })]))).toMatchObject({ anchoMostrado: 1920, altoMostrado: 1080, rotacion: 180 });
  });

  test("HEVC de iPhone se reconoce por su códec", async () => {
    expect((await analizar(archivo([pista("hvc1", { ancho: 1920, alto: 1080, rot: 90 })]))).codec).toBe("hvc1");
  });

  test("tkhd de versión 1 (64 bits)", async () => {
    expect(await analizar(archivo([pista("avc1", { version: 1, ancho: 1280, alto: 720 })]))).toMatchObject({ anchoMostrado: 1280, altoMostrado: 720 });
  });

  test("salta las pistas de audio", async () => {
    const info = await analizar(archivo([pista("mp4a", { manejador: "soun" }), pista("avc1")]));
    expect(info.codec).toBe("avc1");
  });

  test("una caja de 64 bits (mdat grande) se recorre bien", async () => {
    const ftyp = caja("ftyp", texto("isom"), u32(0));
    const mdatGrande = [...u32(1), ...texto("mdat"), ...u32(0), ...u32(16 + 50), ...ceros(50)];
    const bytes = Uint8Array.from([...ftyp, ...mdatGrande, ...caja("moov", pista("avc1"))]);
    expect((await analizar(bytes)).codec).toBe("avc1");
  });

  test("sin moov: error claro", async () => {
    const bytes = Uint8Array.from([...caja("ftyp", texto("isom"), u32(0)), ...caja("mdat", ceros(10))]);
    await expect(analizar(bytes)).rejects.toThrow(ErrorMp4);
  });

  test("sin pista de video: error claro", async () => {
    await expect(analizar(archivo([pista("mp4a", { manejador: "soun" })]))).rejects.toThrow(/pista de video/);
  });

  test("archivo truncado: error de MP4 dañado", async () => {
    const completo = archivo([pista("avc1")]);
    await expect(analizar(completo.slice(0, completo.length - 20))).rejects.toThrow(ErrorMp4);
  });
});
