import { MiembroReferencia, FiltrosReferencia, FilaReferenciaConEstado } from "../entities/MiembroReferencia";
import type { CambiosCrudosPadron, NormalizadosPadron } from "../utils/padronExcel";

export interface IMiembroReferenciaRepository {
  buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null>;
  // ¿Hay un padrón cargado para esta sede? Decide si se muestran el menú "Excel" y "Activar desde Excel".
  existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean>;
  listar(organizacionId: string, sucursalId: string, filtros: FiltrosReferencia): Promise<{ filas: FilaReferenciaConEstado[]; total: number }>;
  // Guarda una edición manual (crudos cambiados + normalizadas recalculadas) y la deja registrada.
  actualizarEdicion(
    id: string,
    datos: { crudos: CambiosCrudosPadron; normalizados: NormalizadosPadron; camposEditados: string[]; editadoPor: string }
  ): Promise<MiembroReferencia>;
}
