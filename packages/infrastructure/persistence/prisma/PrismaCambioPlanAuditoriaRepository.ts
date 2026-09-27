import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { ICambioPlanAuditoriaRepository } from "@gym-app/domain/ports/ICambioPlanAuditoriaRepository";
import type {
  CambioPlanAuditoria,
  DatosNuevoCambioPlanAuditoria,
} from "@gym-app/domain/entities/CambioPlanAuditoria";

type FilaCambioPlanAuditoria = {
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
  modo: CambioPlanAuditoria["modo"];
  origen: CambioPlanAuditoria["origen"];
  pagoId: string | null;
  registradoPorId: string;
  fecha: Date;
};

function mapear(fila: FilaCambioPlanAuditoria): CambioPlanAuditoria {
  return { ...fila };
}

export class PrismaCambioPlanAuditoriaRepository implements ICambioPlanAuditoriaRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async crear(datos: DatosNuevoCambioPlanAuditoria): Promise<CambioPlanAuditoria> {
    const registro = await this.prisma.cambioPlanAuditoria.create({
      data: {
        organizacionId: datos.organizacionId,
        miembroId: datos.miembroId,
        planAnteriorId: datos.planAnteriorId,
        planNuevoId: datos.planNuevoId,
        vencimientoAnterior: datos.vencimientoAnterior,
        vencimientoNuevo: datos.vencimientoNuevo,
        diasRestantes: datos.diasRestantes,
        valorNoConsumidoCentavos: datos.valorNoConsumidoCentavos,
        precioAnteriorCentavos: datos.precioAnteriorCentavos,
        diasCicloAnterior: datos.diasCicloAnterior,
        precioNuevoCentavos: datos.precioNuevoCentavos,
        diasCicloNuevo: datos.diasCicloNuevo,
        diasNuevos: datos.diasNuevos,
        montoCobradoCentavos: datos.montoCobradoCentavos,
        modo: datos.modo,
        origen: datos.origen,
        pagoId: datos.pagoId,
        registradoPorId: datos.registradoPorId,
      },
    });
    return mapear(registro);
  }
}
