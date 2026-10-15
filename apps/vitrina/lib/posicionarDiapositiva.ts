// Cuando la secuencia cambia (panel, SSE, recálculo por minuto), la TV sigue en la misma diapositiva si aún existe;
// si desapareció, se queda en la misma posición acotada al rango. Nunca devuelve un índice fuera de rango.
export function posicionarIndice(indicePrevio: number, clavePrevia: string | null, secuencia: { clave: string }[]): number {
  if (secuencia.length === 0) return 0;
  const encontrada = clavePrevia === null ? -1 : secuencia.findIndex((d) => d.clave === clavePrevia);
  if (encontrada >= 0) return encontrada;
  return Math.min(Math.max(indicePrevio, 0), secuencia.length - 1);
}
