import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  // Pagos de miembros de la organización, no anulados, cuyo ciclo termina después de `ahora` (base de los saldos de membresía).
  listarConCicloAbierto(organizacionId: string, ahora: Date): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]>;
  listarPorTurno(turnoId: string): Promise<Pago[]>;
  buscarPorId(organizacionId: string, id: string): Promise<Pago | null>;
  // Filas de un mismo cobro (mismo grupoPagoId) que siguen sin anular.
  contarVigentesPorGrupo(organizacionId: string, grupoPagoId: string): Promise<number>;
  anular(organizacionId: string, id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago>;
}
