import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { IArqueoRepository } from "../ports/IArqueoRepository";
import { Turno } from "../entities/Turno";
import { Pago } from "../entities/Pago";
import { Egreso } from "../entities/Egreso";
import { ArqueoLinea } from "../entities/ArqueoLinea";

export interface FilaReporteTurno {
  turno: Turno;
  pagos: Pago[];
  egresos: Egreso[];
  arqueo: ArqueoLinea[];
  totalUSD: number;
}

export interface ReporteCaja {
  turnos: FilaReporteTurno[];
  ajustesFueraDeTurno: Pago[];
  totalUSD: number;
}

export async function obtenerReporteCaja(
  deps: { turnos: ITurnoRepository; pagos: IPagoRepository; egresos: IEgresoRepository; arqueo: IArqueoRepository },
  input: { organizacionId: string; desde: Date; hasta: Date }
): Promise<ReporteCaja> {
  const [turnos, todosLosPagos] = await Promise.all([
    deps.turnos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta),
    deps.pagos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta),
  ]);

  const filasTurno: FilaReporteTurno[] = await Promise.all(
    turnos.map(async (turno) => {
      const [pagos, egresos, arqueo] = await Promise.all([
        deps.pagos.listarPorTurno(turno.id),
        deps.egresos.listarPorTurno(turno.id),
        deps.arqueo.listarPorTurno(turno.id),
      ]);
      const totalUSD = pagos.filter((p) => !p.anuladoEn).reduce((suma, p) => suma + p.monto, 0);
      return { turno, pagos, egresos, arqueo, totalUSD };
    })
  );

  const ajustesFueraDeTurno = todosLosPagos.filter((p) => !p.turnoId);
  const totalUSD = todosLosPagos.filter((p) => !p.anuladoEn).reduce((suma, p) => suma + p.monto, 0);

  return { turnos: filasTurno, ajustesFueraDeTurno, totalUSD };
}
