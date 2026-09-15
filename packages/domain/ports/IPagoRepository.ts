import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]>;
}
