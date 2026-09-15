import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago } from "../entities/Pago";

export interface FilaReporteCaja {
  pagoId: string;
  miembroId: string;
  miembroNombre: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  fechaPago: Date;
  esAlta: boolean;
}

export interface ReporteCaja {
  filas: FilaReporteCaja[];
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
}

// "Alta" = el primer pago histórico de ese miembro. Para saberlo hace
// falta su historial completo, no solo el del rango pedido — se pide una
// vez por miembro distinto en el rango (no una vez por fila) y se cachea
// acá. A la escala actual (un gym, pocos pagos por día) es suficiente; si
// el volumen crece mucho, esto se resuelve con una consulta agregada.
export async function obtenerReporteCaja(
  deps: { pagos: IPagoRepository },
  input: { organizacionId: string; desde: Date; hasta: Date }
): Promise<ReporteCaja> {
  const pagos = await deps.pagos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta);

  const historialesPorMiembro = new Map<string, Pago[]>();
  const filas: FilaReporteCaja[] = [];
  const desglosePorMetodo: Record<string, number> = {};
  let totalUSD = 0;

  for (const pago of pagos) {
    if (!historialesPorMiembro.has(pago.miembroId)) {
      historialesPorMiembro.set(pago.miembroId, await deps.pagos.listarPorMiembro(pago.miembroId));
    }
    const historial = historialesPorMiembro.get(pago.miembroId)!;
    const primerPago = historial.reduce((min, p) => (p.fechaPago < min.fechaPago ? p : min), historial[0]);

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
      esAlta: primerPago.id === pago.id,
    });
  }

  return { filas, totalUSD, desglosePorMetodo };
}
