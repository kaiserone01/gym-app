import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]>;
  listarPorTurno(turnoId: string): Promise<Pago[]>;
  buscarPorId(id: string): Promise<Pago | null>;
  anular(id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago>;
}
