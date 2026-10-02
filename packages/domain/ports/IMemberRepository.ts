import { Miembro, DatosNuevoMiembro, CambiosMiembro } from "../entities/Miembro";

export interface IMemberRepository {
  buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null>;
  buscarPorId(organizacionId: string, id: string): Promise<Miembro | null>;
  listarPorOrganizacion(organizacionId: string): Promise<Miembro[]>;
  crear(datos: DatosNuevoMiembro): Promise<Miembro>;
  actualizar(organizacionId: string, id: string, cambios: CambiosMiembro): Promise<Miembro | null>;
  // Borrado físico del miembro junto con TODO su historial (pagos, suscripciones, check-ins, deudas y auditoría de cambios de plan).
  eliminarConHistorial(organizacionId: string, id: string): Promise<void>;
  actualizarFechasPago(id: string, fechaUltimoPago: Date, fechaVencimiento: Date): Promise<void>;
}
