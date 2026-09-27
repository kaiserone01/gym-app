import { CambioPlanAuditoria, DatosNuevoCambioPlanAuditoria } from "../entities/CambioPlanAuditoria";

export interface ICambioPlanAuditoriaRepository {
  crear(datos: DatosNuevoCambioPlanAuditoria): Promise<CambioPlanAuditoria>;
}
