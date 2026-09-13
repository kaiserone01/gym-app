export type RolUsuario = "DUENO" | "GERENTE" | "RECEPCION" | "ENTRENADOR";

export interface UsuarioAdmin {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  rol: RolUsuario;
  email: string;
}
