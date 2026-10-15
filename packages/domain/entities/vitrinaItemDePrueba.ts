import type { VitrinaItem } from "./Vitrina";

let contador = 0;

// Solo para tests: un ítem válido con valores neutros que cada prueba sobrescribe.
export function itemDePrueba(parcial: Partial<VitrinaItem> = {}): VitrinaItem {
  contador += 1;
  return {
    id: `item-${contador}`,
    sucursalId: "suc-1",
    tipo: "PROMO",
    orden: contador,
    activo: true,
    duracionSeg: null,
    inicio: null,
    fin: null,
    mediaUrl: `https://r2.test/vitrina/${contador}.webp`,
    mediaTipo: "IMAGEN",
    posterUrl: null,
    precioUSD: null,
    ofertaUSD: null,
    descuentoPct: null,
    etiqueta: null,
    mostrarPrecio: true,
    mostrarOferta: true,
    mostrarDescuento: true,
    mostrarEtiqueta: true,
    mostrarEquivalenteBs: true,
    nombre: null,
    especialidad: null,
    frase: null,
    mostrarMedio: true,
    mostrarNombre: true,
    mostrarEspecialidad: true,
    mostrarFrase: true,
    ...parcial,
  };
}
