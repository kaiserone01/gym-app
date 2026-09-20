export type RolUsuario = "SOCIO" | "GERENTE" | "RECEPCION" | "ENTRENADOR";

export interface UsuarioAdmin {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  telefono: string | null;
  fotoUrl: string | null;
  rol: RolUsuario;
  email: string;
  activo: boolean;
}

export interface CambiosUsuarioAdmin {
  nombre?: string;
  telefono?: string | null;
  fotoUrl?: string | null;
  activo?: boolean;
}
