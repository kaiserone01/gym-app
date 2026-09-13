import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean>;
}
