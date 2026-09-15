import { IPagoRepository } from "../ports/IPagoRepository";

export interface FilaReporteCaja {
  pagoId: string;
  miembroId: string;
  miembroNombre: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  fechaPago: Date;
  // Precio del plan que el Miembro tiene hoy — usado para agrupar el
  // reporte por tipo de plan dentro de cada método/banco.
  miembroPrecioPlan: number;
}

export interface ReporteCaja {
  filas: FilaReporteCaja[];
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
}

export async function obtenerReporteCaja(
  deps: { pagos: IPagoRepository },
  input: { organizacionId: string; desde: Date; hasta: Date }
): Promise<ReporteCaja> {
  const pagos = await deps.pagos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta);

  const filas: FilaReporteCaja[] = [];
  const desglosePorMetodo: Record<string, number> = {};
  let totalUSD = 0;

  for (const pago of pagos) {
    totalUSD += pago.monto;
    desglosePorMetodo[pago.metodo] = (desglosePorMetodo[pago.metodo] ?? 0) + pago.monto;

    filas.push({
      pagoId: pago.id,
      miembroId: pago.miembroId,
      miembroNombre: pago.miembroNombre ?? "",
      monto: pago.monto,
      metodo: pago.metodo,
      numeroOperacion: pago.numeroOperacion,
      fechaPago: pago.fechaPago,
      miembroPrecioPlan: pago.miembroPrecioPlan ?? 0,
    });
  }

  return { filas, totalUSD, desglosePorMetodo };
}
