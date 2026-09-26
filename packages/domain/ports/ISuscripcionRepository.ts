import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null>;
  // Todas las Suscripciones ACTIVA vigentes (fin >= fecha) que usan este Plan —
  // usado para el recálculo masivo al cambiar frecuencia/entrenador del Plan.
  listarActivasVigentesPorPlan(planId: string, fecha: Date): Promise<Suscripcion[]>;
  extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion>;
  crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date; fechaLimiteAbono: Date | null }): Promise<Suscripcion>;
  // Cambia el plan de una Suscripcion sin tocar inicio/fin — usado al subir
  // de plan cobrando solo la diferencia (ver CambiarPlanConPago), donde el
  // ciclo ya pagado no se extiende.
  cambiarPlan(id: string, planId: string): Promise<Suscripcion>;
  // Actualiza (o limpia, con null) el plazo de acceso que otorga el monto
  // abonado hasta ahora en el ciclo — ver packages/domain/entities/ReglaAbono.ts.
  actualizarFechaLimiteAbono(id: string, fechaLimiteAbono: Date | null): Promise<Suscripcion>;
}
