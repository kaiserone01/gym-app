export interface Miembro {
  id: string;
  organizacionId: string;
  sucursalId: string | null; // null = "Ambas" (todas las sedes de la organización), solo si plan.multisede
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  planId: string | null;
  precioPlan: number;
  saldoAFavorUSD: number;
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  ajustarFecha: boolean; // fecha de vencimiento no confiable (migración): el socio debe ajustarla o registrar un pago con la fecha real
  createdAt: Date;
}

export interface DatosNuevoMiembro {
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  planId: string | null;
  precioPlan: number;
}

export interface CambiosMiembro {
  nombre?: string;
  sucursalId?: string | null;
  fechaInscripcion?: Date | null;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  fotoUrl?: string | null;
  entrenadorId?: string | null;
  planId?: string | null;
  precioPlan?: number;
  saldoAFavorUSD?: number;
  fechaVencimiento?: Date | null;
  activo?: boolean;
  ajustarFecha?: boolean;
}
