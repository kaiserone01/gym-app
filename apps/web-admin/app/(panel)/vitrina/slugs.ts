import type { TipoVitrinaItem } from "@gym-app/domain/entities/Vitrina";

export const SLUG_DE_TIPO: Record<TipoVitrinaItem, string> = {
  ENTRENADOR: "entrenadores",
  PROMO: "promos",
  PRODUCTO: "productos",
};

export const TITULO_DE_TIPO: Record<TipoVitrinaItem, string> = {
  ENTRENADOR: "Entrenador",
  PROMO: "Promo",
  PRODUCTO: "Producto",
};

export function tipoDeSlug(slug: string): TipoVitrinaItem | null {
  const entrada = Object.entries(SLUG_DE_TIPO).find(([, valor]) => valor === slug);
  return entrada ? (entrada[0] as TipoVitrinaItem) : null;
}
