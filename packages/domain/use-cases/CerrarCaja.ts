import { ICierreCajaRepository } from "../ports/ICierreCajaRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { CierreCaja } from "../entities/CierreCaja";

export class DiaYaCerradoError extends Error {
  constructor() {
    super("Ya existe un cierre de caja para este día.");
  }
}

function inicioDelDia(fecha: Date): Date {
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);
  return dia;
}

function finDelDia(fecha: Date): Date {
  const dia = new Date(fecha);
  dia.setHours(23, 59, 59, 999);
  return dia;
}

export async function cerrarCaja(
  deps: { cierres: ICierreCajaRepository; pagos: IPagoRepository },
  input: { organizacionId: string; fecha: Date }
): Promise<CierreCaja> {
  const fecha = inicioDelDia(input.fecha);

  const existente = await deps.cierres.buscarPorFecha(input.organizacionId, fecha);
  if (existente) {
    throw new DiaYaCerradoError();
  }

  const pagos = await deps.pagos.listarPorOrganizacionYRango(input.organizacionId, fecha, finDelDia(fecha));

  const desglosePorMetodo: Record<string, number> = {};
  let totalUSD = 0;
  for (const pago of pagos) {
    totalUSD += pago.monto;
    desglosePorMetodo[pago.metodo] = (desglosePorMetodo[pago.metodo] ?? 0) + pago.monto;
  }

  return deps.cierres.crear({ organizacionId: input.organizacionId, fecha, totalUSD, desglosePorMetodo });
}
