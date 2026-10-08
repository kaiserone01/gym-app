// Género del miembro, solo para saludarlo en el kiosco ("Bienvenido" / "Bienvenida"). null = no definido.
export const GENEROS = ["MASCULINO", "FEMENINO"] as const;
export type Genero = (typeof GENEROS)[number];

export function parsearGenero(valor: unknown): Genero | null {
  return GENEROS.find((genero) => genero === valor) ?? null;
}

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
  genero: Genero | null; // para el saludo del kiosco; null = no definido
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
  genero?: Genero | null;
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
  fechaVencimiento?: Date | null;
  activo?: boolean;
  ajustarFecha?: boolean;
  genero?: Genero | null;
}
