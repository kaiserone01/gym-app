import type { AjustesVitrina, ItemManifiesto, ManifiestoVitrina, VitrinaItem } from "../entities/Vitrina";
import { estaVencido } from "./secuenciaVitrina";

// El manifiesto excluye los ítems inactivos y los ya vencidos (la TV borra sus archivos) y mantiene los
// futuros (la TV los muestra cuando llegue su fecha, incluso sin red).
export function armarManifiesto(entrada: {
  items: VitrinaItem[];
  ajustes: AjustesVitrina;
  tasaBcv: { valor: number; fecha: string } | null;
  ahora: Date;
}): ManifiestoVitrina {
  const items: ItemManifiesto[] = entrada.items
    .filter((item) => item.activo && !estaVencido(item, entrada.ahora))
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
    .map((item) => ({ ...item, inicio: item.inicio?.toISOString() ?? null, fin: item.fin?.toISOString() ?? null }));
  return {
    version: entrada.ajustes.version,
    servidorAhora: entrada.ahora.toISOString(),
    duracionSeg: entrada.ajustes.duracionSeg,
    transicion: entrada.ajustes.transicion,
    tasaBcv: entrada.tasaBcv,
    items,
  };
}

export function itemsDeManifiesto(manifiesto: ManifiestoVitrina): VitrinaItem[] {
  return manifiesto.items.map((item) => ({
    ...item,
    inicio: item.inicio ? new Date(item.inicio) : null,
    fin: item.fin ? new Date(item.fin) : null,
  }));
}

// Todas las piezas que la TV debe tener en disco: medios y pósters, sin repetir.
export function urlsDeManifiesto(manifiesto: ManifiestoVitrina): string[] {
  const urls = new Set<string>();
  for (const item of manifiesto.items) {
    urls.add(item.mediaUrl);
    if (item.posterUrl) urls.add(item.posterUrl);
  }
  return [...urls];
}
