import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean>;
  buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null>;
  extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion>;
  crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date }): Promise<Suscripcion>;
}
