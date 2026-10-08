import { MiembroReferencia, FiltrosReferencia, FilaReferenciaConEstado } from "../entities/MiembroReferencia";

export interface IMiembroReferenciaRepository {
  buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null>;
  // ¿Hay un padrón cargado para esta sede? Decide si se muestran el menú "Excel" y "Activar desde Excel".
  existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean>;
  listar(organizacionId: string, sucursalId: string, filtros: FiltrosReferencia): Promise<{ filas: FilaReferenciaConEstado[]; total: number }>;
}
