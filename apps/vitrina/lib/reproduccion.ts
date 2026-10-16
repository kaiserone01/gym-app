import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";

// Tiempos y cola de los videos de la TV. Todo es puro: los componentes solo leen el reloj y los eventos del <video>.
export const ESTANCADO_MS = 20_000; // sin avanzar el currentTime durante este tiempo, el video se salta
export const TOPE_VIDEO_MS = 10 * 60_000; // tope absoluto por video

// Ids de los entrenadores de una franja cuyo video se reproduce, en orden de columna.
export function colaDeVideos(entrenadores: Pick<VitrinaItem, "id" | "mostrarMedio" | "mediaTipo">[]): string[] {
  return entrenadores.filter((e) => e.mostrarMedio && e.mediaTipo === "VIDEO").map((e) => e.id);
}

// Tras terminar (o saltar) el video en `posicion`: la siguiente posición. Si era el último, `terminada`; en una
// diapositiva única la cola se reinicia desde el primero (`circular`).
export function siguienteTurno(posicion: number, largo: number, circular: boolean): { posicion: number; terminada: boolean } {
  const siguiente = posicion + 1;
  if (siguiente < largo) return { posicion: siguiente, terminada: false };
  return circular ? { posicion: 0, terminada: false } : { posicion: largo, terminada: true };
}

// La cola ya se recorrió pero nadie avisó el fin (p. ej. se acortó porque la secuencia cambió con un video en curso).
export function colaAgotada(posicion: number, largo: number): boolean {
  return largo > 0 && posicion >= largo;
}

// Red de seguridad: pase lo que pase con los eventos, una diapositiva con videos no dura más que esto.
export function techoDiapositivaMs(cantidadVideos: number, duracionSeg: number): number {
  return Math.max(cantidadVideos, 1) * TOPE_VIDEO_MS + duracionSeg * 1000;
}

// Cuánto falta (ms) para pasar a la siguiente diapositiva, o null si hay que esperar al fin de sus videos.
//  - sin videos: `duracionSeg`;
//  - cartel con video: al terminar el video; si falló (se muestra el póster), `duracionSeg`;
//  - franja con videos: tras el último video y habiendo pasado al menos `duracionSeg`.
export function msParaAvanzar(e: {
  conVideo: boolean;
  esFranja: boolean;
  videosTerminados: boolean;
  huboFallo: boolean;
  transcurridoMs: number;
  duracionSeg: number;
}): number | null {
  const faltaMinimo = Math.max(0, e.duracionSeg * 1000 - e.transcurridoMs);
  if (!e.conVideo) return faltaMinimo;
  if (!e.videosTerminados) return null;
  return e.esFranja || e.huboFallo ? faltaMinimo : 0;
}

// Si el currentTime cambió, ahora es el último avance; si no, se conserva el anterior.
export function ultimoAvance(tiempoPrevio: number, tiempo: number, ahoraMs: number, avancePrevioMs: number): number {
  return tiempo !== tiempoPrevio ? ahoraMs : avancePrevioMs;
}

export type VeredictoVideo = "SEGUIR" | "ESTANCADO" | "TOPE";

// `conTope` es false cuando el video va en bucle (diapositiva única): ahí no hay un "fin" que vigilar.
export function evaluarVideo(e: { ahoraMs: number; inicioMs: number; ultimoAvanceMs: number; conTope: boolean }): VeredictoVideo {
  if (e.conTope && e.ahoraMs - e.inicioMs >= TOPE_VIDEO_MS) return "TOPE";
  if (e.ahoraMs - e.ultimoAvanceMs >= ESTANCADO_MS) return "ESTANCADO";
  return "SEGUIR";
}
