export interface Sucursal {
  id: string;
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  activo: boolean;
  apiKey: string;
}

export interface CambiosSucursal {
  nombre?: string;
  direccion?: string | null;
  diasGracia?: number;
  activo?: boolean;
}

export interface DatosNuevaSucursal {
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
}
