import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { Turno } from "../entities/Turno";
import { Pago } from "../entities/Pago";
import { Egreso } from "../entities/Egreso";

// Métodos de efectivo físico — únicos que arrancan con el fondo inicial del
// turno. Deben coincidir exactamente con el snapshot que construye
// construirNombreMetodo() en apps/web-admin/app/(panel)/configuraciones/
// metodosPagoUI.ts para MetodoPago.tipo === "EFECTIVO" — domain no puede
// importar de apps (regla de la arquitectura hexagonal de este repo), así
// que se duplican los strings literales acá.
export const METODO_EFECTIVO_USD = "Efectivo (USD)";
export const METODO_EFECTIVO_BS = "Efectivo (Bs)";
export const METODOS_EFECTIVO = [METODO_EFECTIVO_USD, METODO_EFECTIVO_BS];

export class TurnoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el turno.");
  }
}

export interface LineaResumenMetodo {
  metodo: string;
  totalPagos: number;
  totalEgresos: number;
  montoEsperado: number;
}

export interface ResumenTurno {
  turno: Turno;
  pagos: Pago[];
  egresos: Egreso[];
  lineas: LineaResumenMetodo[];
}

export async function obtenerResumenTurno(
  deps: { turnos: ITurnoRepository; pagos: IPagoRepository; egresos: IEgresoRepository },
  input: { organizacionId: string; turnoId: string }
): Promise<ResumenTurno> {
  const turno = await deps.turnos.buscarPorId(input.organizacionId, input.turnoId);
  if (!turno) {
    throw new TurnoNoEncontradoError();
  }

  const [pagos, egresos] = await Promise.all([
    deps.pagos.listarPorTurno(input.turnoId),
    deps.egresos.listarPorTurno(input.turnoId),
  ]);

  const metodos = new Set<string>([
    ...METODOS_EFECTIVO,
    ...pagos.map((p) => p.metodo),
    ...egresos.map((e) => e.metodo),
  ]);

  const lineas: LineaResumenMetodo[] = [...metodos].map((metodo) => {
    const totalPagos = pagos
      .filter((p) => p.metodo === metodo && !p.anuladoEn)
      .reduce((suma, p) => suma + p.monto, 0);
    const totalEgresos = egresos
      .filter((e) => e.metodo === metodo)
      .reduce((suma, e) => suma + e.monto, 0);

    const fondoInicial =
      metodo === METODO_EFECTIVO_USD
        ? turno.fondoInicialEfectivoUSD
        : metodo === METODO_EFECTIVO_BS
          ? turno.fondoInicialEfectivoBs
          : 0;

    return {
      metodo,
      totalPagos,
      totalEgresos,
      montoEsperado: fondoInicial + totalPagos - totalEgresos,
    };
  });

  return { turno, pagos, egresos, lineas };
}
