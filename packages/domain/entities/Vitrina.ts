export const TIPOS_VITRINA = ["ENTRENADOR", "PROMO", "PRODUCTO"] as const;
export type TipoVitrinaItem = (typeof TIPOS_VITRINA)[number];
export type TipoMedio = "IMAGEN" | "VIDEO";
export const TRANSICIONES_VITRINA = ["FUNDIDO", "DESLIZAR"] as const;
export type TransicionVitrina = (typeof TRANSICIONES_VITRINA)[number];

// Un ítem de la secuencia de la TV. La vitrina es independiente del módulo de usuarios: el entrenador guarda su
// propio nombre y su propio medio vertical, sin vínculo con UsuarioAdmin.
export interface VitrinaItem {
  id: string;
  sucursalId: string;
  tipo: TipoVitrinaItem;
  orden: number;
  activo: boolean;
  duracionSeg: number | null; // null = la de la sede
  inicio: Date | null;
  fin: Date | null;
  mediaUrl: string;
  mediaTipo: TipoMedio;
  posterUrl: string | null;
  // Badges (PROMO y PRODUCTO)
  precioUSD: number | null;
  ofertaUSD: number | null;
  descuentoPct: number | null;
  etiqueta: string | null;
  mostrarPrecio: boolean;
  mostrarOferta: boolean;
  mostrarDescuento: boolean;
  mostrarEtiqueta: boolean;
  mostrarEquivalenteBs: boolean;
  // Entrenador (nombre también identifica a las promos y productos en el panel)
  nombre: string | null;
  especialidad: string | null;
  frase: string | null;
  mostrarMedio: boolean;
  mostrarNombre: boolean;
  mostrarEspecialidad: boolean;
  mostrarFrase: boolean;
}

export type DatosVitrinaItem = Omit<VitrinaItem, "id" | "sucursalId" | "orden" | "activo">;
export type CambiosVitrinaItem = Partial<DatosVitrinaItem> & { activo?: boolean };

export interface AjustesVitrina {
  duracionSeg: number;
  transicion: TransicionVitrina;
  version: number;
}

// Lo que viaja por GET /api/kiosco/vitrina: las fechas van en ISO.
export interface ItemManifiesto extends Omit<VitrinaItem, "inicio" | "fin"> {
  inicio: string | null;
  fin: string | null;
}

export interface ManifiestoVitrina {
  version: number;
  servidorAhora: string; // hora del servidor (ISO): la TV guarda la última para su reloj efectivo
  duracionSeg: number;
  transicion: TransicionVitrina;
  tasaBcv: { valor: number; fecha: string } | null; // misma forma que /api/kiosco/estado
  items: ItemManifiesto[];
}
