export type ModuloPermiso = "MIEMBROS" | "PAGOS" | "PLANES" | "CAJA" | "USUARIOS" | "SUCURSALES" | "EN_SALA";
export type AccionPermiso = "VER" | "CREAR" | "EDITAR" | "ELIMINAR";

export interface Permiso {
  modulo: ModuloPermiso;
  accion: AccionPermiso;
}
