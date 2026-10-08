export interface Sucursal {
  id: string;
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  activo: boolean;
  apiKey: string;
  reposoFrases: string[];
  reposoImagenUrl: string | null;
  reposoOpacidad: number;
}

export interface CambiosSucursal {
  nombre?: string;
  direccion?: string | null;
  diasGracia?: number;
  activo?: boolean;
  reposoFrases?: string[];
  reposoImagenUrl?: string | null;
  reposoOpacidad?: number;
}

export interface DatosNuevaSucursal {
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
}
