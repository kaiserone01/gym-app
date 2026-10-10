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
  porRegularizar: boolean; // fechas y pago vienen de una fuente externa (padrón/Excel o migración anterior) y no están verificados: el socio debe ajustar la fecha o registrar un pago con la fecha real
  vieneDelExcel: boolean; // viene del padrón/migración del Excel: su fecha de pago y de vencimiento se editan siempre en la ficha (no se conoce su fecha de inscripción)
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
  // Solo los usa la activación desde el padrón; un alta normal los deja en su valor por defecto.
  fechaUltimoPago?: Date | null;
  fechaVencimiento?: Date | null;
  porRegularizar?: boolean;
  vieneDelExcel?: boolean;
}

export interface CambiosMiembro {
  nombre?: string;
  cedula?: string;
  sucursalId?: string | null;
  fechaInscripcion?: Date | null;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  fotoUrl?: string | null;
  entrenadorId?: string | null;
  planId?: string | null;
  precioPlan?: number;
  saldoAFavorUSD?: number;
  fechaUltimoPago?: Date | null;
  fechaVencimiento?: Date | null;
  activo?: boolean;
  porRegularizar?: boolean;
}
