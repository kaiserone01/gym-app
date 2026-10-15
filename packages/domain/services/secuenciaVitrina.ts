import type { VitrinaItem } from "../entities/Vitrina";

export const MAX_ENTRENADORES_POR_FRANJA = 3;

export type Diapositiva =
  | { clave: string; tipo: "CARTEL"; item: VitrinaItem; duracionSeg: number }
  | { clave: string; tipo: "FRANJA"; entrenadores: VitrinaItem[]; duracionSeg: number };

export function estaVencido(item: VitrinaItem, ahora: Date): boolean {
  return item.fin !== null && item.fin.getTime() < ahora.getTime();
}

export function estaVisible(item: VitrinaItem, ahora: Date): boolean {
  if (!item.activo || estaVencido(item, ahora)) return false;
  return item.inicio === null || item.inicio.getTime() <= ahora.getTime();
}

export type EstadoVisibilidad = "INACTIVO" | "VENCIDO" | "PROGRAMADO" | "EN_PANTALLA";

export function estadoVisibilidad(item: VitrinaItem, ahora: Date): EstadoVisibilidad {
  if (!item.activo) return "INACTIVO";
  if (estaVencido(item, ahora)) return "VENCIDO";
  if (item.inicio !== null && item.inicio.getTime() > ahora.getTime()) return "PROGRAMADO";
  return "EN_PANTALLA";
}

// n entrenadores → ceil(n/3) franjas lo más parejas posible, las mayores primero. Nunca una franja de 1
// salvo que n = 1: 4→2+2, 5→3+2, 7→3+2+2.
export function repartirFranjas(n: number): number[] {
  if (n <= 0) return [];
  const franjas = Math.ceil(n / MAX_ENTRENADORES_POR_FRANJA);
  const base = Math.floor(n / franjas);
  const resto = n % franjas;
  return Array.from({ length: franjas }, (_, i) => base + (i < resto ? 1 : 0));
}

// La secuencia que muestra la TV en `ahora`. Los entrenadores que quedan consecutivos tras descartar los no
// visibles se agrupan en franjas; un cartel de promo o producto entre dos de ellos corta el grupo.
export function construirSecuencia(items: VitrinaItem[], ahora: Date, duracionPorDefectoSeg: number): Diapositiva[] {
  const visibles = items
    .filter((item) => estaVisible(item, ahora))
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

  const secuencia: Diapositiva[] = [];
  let i = 0;
  while (i < visibles.length) {
    const item = visibles[i];
    if (item.tipo !== "ENTRENADOR") {
      secuencia.push({ clave: item.id, tipo: "CARTEL", item, duracionSeg: item.duracionSeg ?? duracionPorDefectoSeg });
      i += 1;
      continue;
    }
    let fin = i;
    while (fin < visibles.length && visibles[fin].tipo === "ENTRENADOR") fin += 1;
    const grupo = visibles.slice(i, fin);
    let desde = 0;
    for (const tamano of repartirFranjas(grupo.length)) {
      const entrenadores = grupo.slice(desde, desde + tamano);
      desde += tamano;
      secuencia.push({
        clave: `franja:${entrenadores.map((e) => e.id).join("+")}`,
        tipo: "FRANJA",
        entrenadores,
        duracionSeg: entrenadores[0].duracionSeg ?? duracionPorDefectoSeg,
      });
    }
    i = fin;
  }
  return secuencia;
}

// id del ítem → número (1, 2, 3…) de la diapositiva en que sale; el panel lo muestra en la vista "Secuencia".
export function numeroDeDiapositiva(secuencia: Diapositiva[]): Map<string, number> {
  const numeros = new Map<string, number>();
  secuencia.forEach((diapositiva, indice) => {
    const items = diapositiva.tipo === "CARTEL" ? [diapositiva.item] : diapositiva.entrenadores;
    for (const item of items) numeros.set(item.id, indice + 1);
  });
  return numeros;
}
