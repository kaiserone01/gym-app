import { MiembroReferencia, FilaReferenciaConEstado, HojaPadron } from "../entities/MiembroReferencia";
import type { CambiosCrudosPadron, NormalizadosPadron } from "../utils/padronExcel";

export interface IMiembroReferenciaRepository {
  buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null>;
  // ¿Hay un padrón cargado para esta sede? Decide si se muestran el menú "Excel" y "Activar desde Excel".
  existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean>;
  // Todas las filas de la sede ordenadas por numeroFila, con el miembroId de quien ya ocupa la cédula.
  listarTodas(organizacionId: string, sucursalId: string): Promise<FilaReferenciaConEstado[]>;
  obtenerHoja(organizacionId: string, sucursalId: string): Promise<HojaPadron | null>;
  // Guarda una edición manual y la deja registrada. resaltado: undefined = no tocar; string | null = fijar o quitar.
  actualizarEdicion(
    id: string,
    datos: { crudos: CambiosCrudosPadron; normalizados?: NormalizadosPadron; camposEditados?: string[]; editadoPor: string; resaltado?: string | null }
  ): Promise<MiembroReferencia>;
}
