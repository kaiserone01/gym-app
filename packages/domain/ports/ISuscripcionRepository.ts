import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null>;
  // Todas las Suscripciones ACTIVA vigentes (fin >= fecha) que usan este Plan —
  // usado para el recálculo masivo al cambiar frecuencia/entrenador del Plan.
  listarActivasVigentesPorPlan(planId: string, fecha: Date): Promise<Suscripcion[]>;
  extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion>;
  crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date }): Promise<Suscripcion>;
}
