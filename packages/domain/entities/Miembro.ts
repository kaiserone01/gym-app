export type PlanTipo = "SIN_ENTRENADOR" | "CON_ENTRENADOR";

export interface Miembro {
  id: string;
  organizacionId: string;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  planTipo: PlanTipo;
  precioPlan: number;
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
}

export interface DatosNuevoMiembro {
  organizacionId: string;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  planTipo: PlanTipo;
  precioPlan: number;
}

export interface CambiosMiembro {
  nombre?: string;
  fechaInscripcion?: Date | null;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  fotoUrl?: string | null;
  entrenadorId?: string | null;
  planTipo?: PlanTipo;
  precioPlan?: number;
  activo?: boolean;
}
