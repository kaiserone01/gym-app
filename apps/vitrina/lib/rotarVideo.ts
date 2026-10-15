// En una franja reproduce un solo video a la vez: el id del video activo en el turno dado (rota entre columnas).
export function idVideoActivo(idsConVideo: string[], turno: number): string | null {
  if (idsConVideo.length === 0) return null;
  return idsConVideo[((turno % idsConVideo.length) + idsConVideo.length) % idsConVideo.length];
}

// Cada cuántos ms cambia el turno para que todos los videos tengan el mismo tiempo en pantalla.
export function msPorTurno(duracionSeg: number, cantidadVideos: number): number {
  return (duracionSeg * 1000) / Math.max(cantidadVideos, 1);
}
