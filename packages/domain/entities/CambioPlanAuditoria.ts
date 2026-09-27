import type { ModoCambioPlan } from "./cambioPlanCalculo";

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
