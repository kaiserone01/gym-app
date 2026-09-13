import { Plan, DatosNuevoPlan, CambiosPlan } from "../entities/Plan";

export interface IPlanRepository {
  listarPorOrganizacion(organizacionId: string): Promise<Plan[]>;
  buscarPorId(organizacionId: string, id: string): Promise<Plan | null>;
  // true solo si CADA id en sucursalIds existe y pertenece a organizacionId.
  sucursalesValidas(organizacionId: string, sucursalIds: string[]): Promise<boolean>;
  crear(datos: DatosNuevoPlan): Promise<Plan>;
  actualizar(organizacionId: string, id: string, cambios: CambiosPlan): Promise<Plan | null>;
}
