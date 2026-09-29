export interface Producto {
  id: string;
  organizacionId: string;
  nombre: string;
  descripcion: string | null;
  costoUSD: number;
  fotoUrl: string | null;
  activo: boolean;
}

export interface DatosNuevoProducto {
  organizacionId: string;
  nombre: string;
  descripcion: string | null;
  costoUSD: number;
  fotoUrl: string | null;
}

export interface CambiosProducto {
  nombre?: string;
  descripcion?: string | null;
  costoUSD?: number;
  fotoUrl?: string | null;
  activo?: boolean;
}
