export type ModuloPermiso = "MIEMBROS" | "PAGOS" | "PLANES" | "CAJA" | "USUARIOS" | "SUCURSALES";
export type AccionPermiso = "VER" | "CREAR" | "EDITAR" | "ELIMINAR";

export interface Permiso {
  modulo: ModuloPermiso;
  accion: AccionPermiso;
}
