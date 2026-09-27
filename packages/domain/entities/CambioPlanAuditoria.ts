// Modo histórico de un registro de auditoría. "AJUSTAR_VENCIMIENTO" ya no
// se escribe desde el código (único camino de cálculo, ver
// packages/domain/entities/cambioPlanCalculo.ts) — se conserva solo para
// leer registros históricos ya existentes en la base (0 registros con ese
// modo al momento de este cambio).
export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

// Desde dónde se disparó el cambio de plan — ver
// packages/db/prisma/schema.prisma (enum OrigenCambioPlanAuditoria) para
// el detalle de qué flujo corresponde a cada valor.
export type OrigenCambioPlan = "CAJA" | "FICHA_MIEMBRO" | "CAMBIO_FRECUENCIA_PLAN";

export interface CambioPlanAuditoria {
  id: string;
  organizacionId: string;
  miembroId: string;
  planAnteriorId: string;
  planNuevoId: string;
  vencimientoAnterior: Date;
  vencimientoNuevo: Date;
  diasRestantes: number;
  valorNoConsumidoCentavos: number;
  precioAnteriorCentavos: number;
  diasCicloAnterior: number;
  precioNuevoCentavos: number;
  diasCicloNuevo: number;
  diasNuevos: number;
  montoCobradoCentavos: number;
  modo: ModoCambioPlan;
  origen: OrigenCambioPlan;
  pagoId: string | null;
  registradoPorId: string;
  fecha: Date;
}

export interface DatosNuevoCambioPlanAuditoria {
  organizacionId: string;
  miembroId: string;
  planAnteriorId: string;
  planNuevoId: string;
  vencimientoAnterior: Date;
  vencimientoNuevo: Date;
  diasRestantes: number;
  valorNoConsumidoCentavos: number;
  precioAnteriorCentavos: number;
  diasCicloAnterior: number;
  precioNuevoCentavos: number;
  diasCicloNuevo: number;
  diasNuevos: number;
  montoCobradoCentavos: number;
  modo: ModoCambioPlan;
  origen: OrigenCambioPlan;
  pagoId: string | null;
  registradoPorId: string;
}
