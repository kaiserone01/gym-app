import type { FrecuenciaPago } from "../entities/Plan";
import type { ReglaAbonoPorFrecuencia, TipoMinimoAbono } from "../entities/ReglaAbono";

export interface IReglaAbonoRepository {
  buscarPorOrganizacionYFrecuencia(
    organizacionId: string,
    frecuencia: FrecuenciaPago
  ): Promise<ReglaAbonoPorFrecuencia | null>;
  listarPorOrganizacion(organizacionId: string): Promise<ReglaAbonoPorFrecuencia[]>;
  // Crea o actualiza la regla de una frecuencia — no hay "crear" separado
  // porque siempre hay como máximo una fila por (organizacionId, frecuencia).
  upsert(
    organizacionId: string,
    frecuencia: FrecuenciaPago,
    datos: { activo: boolean; tipo: TipoMinimoAbono; valor: number }
  ): Promise<ReglaAbonoPorFrecuencia>;
}
