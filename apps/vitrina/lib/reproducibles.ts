// Deja solo los ítems cuyo medio principal está en el almacén local: una pieza omitida (que no se pudo descargar) no
// debe dejar una diapositiva rota en la secuencia. Cuando la pieza baja, el ítem reaparece.
export function itemsReproducibles<T extends { mediaUrl: string }>(items: readonly T[], tieneLocal: (url: string) => boolean): T[] {
  return items.filter((item) => tieneLocal(item.mediaUrl));
}
