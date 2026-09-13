export type PlanTipo = "SIN_ENTRENADOR" | "CON_ENTRENADOR";

export interface Miembro {
  id: string;
  organizacionId: string;
  nombre: string;
  cedula: string;
  fotoUrl: string | null;
  entrenadorNombre: string | null;
  planTipo: PlanTipo;
}
