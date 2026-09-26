export type EstadoSuscripcion = "ACTIVA" | "VENCIDA" | "CANCELADA" | "PAUSADA";

export interface Suscripcion {
  id: string;
  miembroId: string;
  planId: string;
  inicio: Date;
  fin: Date;
  fechaLimiteAbono: Date | null;
  estado: EstadoSuscripcion;
}
