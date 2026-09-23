import { FrecuenciaPago, Plan, DatosNuevoPlan, CambiosPlan } from "../entities/Plan";

export interface IPlanRepository {
  listarPorOrganizacion(organizacionId: string): Promise<Plan[]>;
  buscarPorId(organizacionId: string, id: string): Promise<Plan | null>;
  crear(datos: DatosNuevoPlan): Promise<Plan>;
  actualizar(organizacionId: string, id: string, cambios: CambiosPlan): Promise<Plan | null>;
  // Cuenta las Suscripciones ACTIVA vigentes (fin >= ahora) que usan este
  // Plan — usado en el modal de doble alerta al cambiar frecuencia/entrenador.
  contarSuscripcionesActivasVigentes(planId: string, ahora: Date): Promise<number>;
  actualizarFrecuenciaYEntrenador(
    id: string,
    frecuencia: FrecuenciaPago,
    incluyeEntrenador: boolean
  ): Promise<Plan>;
  /**
   * Borrado físico. Sin onDelete: Cascade en Miembro.planId/Suscripcion.planId
   * — falla si algún miembro o suscripción sigue usando este plan; ver
   * EliminarPlan.ts, que traduce eso a un error de dominio legible.
   */
  eliminar(id: string): Promise<void>;
}
