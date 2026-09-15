import { CierreCaja, DatosNuevoCierreCaja } from "../entities/CierreCaja";

export interface ICierreCajaRepository {
  buscarPorFecha(organizacionId: string, fecha: Date): Promise<CierreCaja | null>;
  crear(datos: DatosNuevoCierreCaja): Promise<CierreCaja>;
  listarPorOrganizacion(organizacionId: string): Promise<CierreCaja[]>;
}
