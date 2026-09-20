export type RolUsuario = "SOCIO" | "GERENTE" | "RECEPCION" | "ENTRENADOR";

export interface UsuarioAdmin {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  rol: RolUsuario;
  email: string;
  activo: boolean;
}

export interface CambiosUsuarioAdmin {
  nombre?: string;
  activo?: boolean;
}
