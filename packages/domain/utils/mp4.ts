// Lector mínimo de MP4/MOV para validar un video ANTES de subirlo (la subida va directa a R2 y el servidor no lo
// ve). Recorre solo las cabeceras de las cajas hasta moov > trak > mdia/minf/stbl/stsd y tkhd; nunca carga el
// archivo entero (el moov puede estar al final de un video de 100 MB).
export class ErrorMp4 extends Error {}

export interface InfoMp4 {
  codec: string; // avc1/avc3 = H.264, hvc1/hev1 = HEVC…
  anchoMostrado: number; // ya aplicada la marca de rotación
  altoMostrado: number;
  rotacion: 0 | 90 | 180 | 270;
}

export type LectorBytes = (desde: number, largo: number) => Promise<Uint8Array>;

interface Caja {
  tipo: string;
  datos: number; // offset del contenido
  fin: number;
}

const decodificar = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const DANADO = "El archivo MP4 está dañado o incompleto.";

async function* cajas(lector: LectorBytes, desde: number, hasta: number): AsyncGenerator<Caja> {
  let pos = desde;
  while (pos + 8 <= hasta) {
    const cabecera = await lector(pos, 16);
    if (cabecera.length < 8) throw new ErrorMp4(DANADO);
    const vista = new DataView(cabecera.buffer, cabecera.byteOffset, cabecera.byteLength);
    let tamano = vista.getUint32(0);
    const tipo = decodificar(cabecera.subarray(4, 8));
    let largoCabecera = 8;
    if (tamano === 1) {
      if (cabecera.length < 16) throw new ErrorMp4(DANADO);
      tamano = Number(vista.getBigUint64(8));
      largoCabecera = 16;
    } else if (tamano === 0) {
      tamano = hasta - pos; // la última caja llega hasta el final
    }
    if (tamano < largoCabecera || pos + tamano > hasta) throw new ErrorMp4(DANADO);
    yield { tipo, datos: pos + largoCabecera, fin: pos + tamano };
    pos += tamano;
  }
}

async function buscar(lector: LectorBytes, padre: Caja, ruta: string[]): Promise<Caja | null> {
  let actual = padre;
  for (const tipo of ruta) {
    let encontrada: Caja | null = null;
    for await (const caja of cajas(lector, actual.datos, actual.fin)) {
      if (caja.tipo === tipo) {
        encontrada = caja;
        break;
      }
    }
    if (!encontrada) return null;
    actual = encontrada;
  }
  return actual;
}

function rotacionDe(a: number, b: number): 0 | 90 | 180 | 270 {
  if (Math.abs(a) >= Math.abs(b)) return a >= 0 ? 0 : 180;
  return b >= 0 ? 90 : 270;
}

async function analizarPista(lector: LectorBytes, pista: Caja): Promise<InfoMp4 | null> {
  const hdlr = await buscar(lector, pista, ["mdia", "hdlr"]);
  if (!hdlr || decodificar(await lector(hdlr.datos + 8, 4)) !== "vide") return null;
  const tkhd = await buscar(lector, pista, ["tkhd"]);
  const stsd = await buscar(lector, pista, ["mdia", "minf", "stbl", "stsd"]);
  if (!tkhd || !stsd) return null;

  const codec = decodificar(await lector(stsd.datos + 12, 4));
  const version = (await lector(tkhd.datos, 1))[0];
  const matriz = await lector(tkhd.datos + (version === 1 ? 52 : 40), 44); // matriz (36) + ancho + alto
  const vista = new DataView(matriz.buffer, matriz.byteOffset, matriz.byteLength);
  const rotacion = rotacionDe(vista.getInt32(0) / 65536, vista.getInt32(4) / 65536);
  const ancho = vista.getUint32(36) / 65536;
  const alto = vista.getUint32(40) / 65536;
  const gira = rotacion === 90 || rotacion === 270;
  return {
    codec,
    anchoMostrado: Math.round(gira ? alto : ancho),
    altoMostrado: Math.round(gira ? ancho : alto),
    rotacion,
  };
}

export async function analizarMp4(lector: LectorBytes, tamano: number): Promise<InfoMp4> {
  let moov: Caja | null = null;
  for await (const caja of cajas(lector, 0, tamano)) {
    if (caja.tipo === "moov") {
      moov = caja;
      break;
    }
  }
  if (!moov) throw new ErrorMp4("No es un video MP4 válido (falta la información del video).");

  for await (const pista of cajas(lector, moov.datos, moov.fin)) {
    if (pista.tipo !== "trak") continue;
    const info = await analizarPista(lector, pista);
    if (info) return info;
  }
  throw new ErrorMp4("El archivo no contiene una pista de video.");
}
