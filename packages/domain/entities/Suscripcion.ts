export type TipoAccesoPlan = "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";
export type EstadoSuscripcion = "ACTIVA" | "VENCIDA" | "CANCELADA" | "PAUSADA";

export interface Plan {
  id: string;
  organizacionId: string;
  tipoAcceso: TipoAccesoPlan;
}

export interface Suscripcion {
  id: string;
  miembroId: string;
  plan: Plan;
  inicio: Date;
  fin: Date;
  estado: EstadoSuscripcion;
}
