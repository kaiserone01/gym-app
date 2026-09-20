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
  // true si este método opera en bolívares (su fondo, pagos, egresos y
  // esperado están en Bs) — hoy solo METODO_EFECTIVO_BS, pero se deja
  // como flag explícito por si se agregan más métodos en Bs a futuro.
  enBs: boolean;
  // Todos los montos de esta línea están en la moneda nativa del método
  // (enBs ? Bs : USD).
  totalPagos: number;
  totalEgresos: number;
  montoEsperado: number;
  // Referencia en USD de totalPagos/totalEgresos — para líneas en USD es
  // el mismo valor; para líneas en Bs se suma la referencia que cada
  // Pago/Egreso capturó con SU PROPIA tasa al momento de la transacción
  // (Pago.monto / Egreso.montoUSD), no una conversión con la tasa actual.
  // El fondo inicial en Bs no tiene tasa propia capturada (se fijó al
  // abrir el turno, no es una transacción) y por eso NO participa acá —
  // la UI lo muestra por separado con la tasa BCV vigente (ver page.tsx).
  totalPagosUSD: number;
  totalEgresosUSD: number;
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
    const enBs = metodo === METODO_EFECTIVO_BS;

    const pagosDelMetodo = pagos.filter((p) => p.metodo === metodo && !p.anuladoEn);
    const egresosDelMetodo = egresos.filter((e) => e.metodo === metodo);

    // Pago.monto siempre está en USD; Pago.montoBs es la conversión al
    // momento del pago. Un método en Bs debe sumarse en Bs (montoBs), no
    // en USD (monto) — mezclar ambos fue el bug original: la línea
    // "Efectivo (Bs)" sumaba montos en USD contra un fondo en Bs.
    const totalPagos = pagosDelMetodo.reduce((suma, p) => suma + (enBs ? p.montoBs ?? 0 : p.monto), 0);
    const totalPagosUSD = pagosDelMetodo.reduce((suma, p) => suma + p.monto, 0);

    // Egreso.monto ya está en su moneda nativa (moneda) — no hace falta
    // elegir entre dos campos como en Pago. Egreso.montoUSD es la
    // referencia calculada al registrar (ver RegistrarEgreso).
    const totalEgresos = egresosDelMetodo.reduce((suma, e) => suma + e.monto, 0);
    const totalEgresosUSD = egresosDelMetodo.reduce((suma, e) => suma + (e.montoUSD ?? 0), 0);

    const fondoInicial =
      metodo === METODO_EFECTIVO_USD
        ? turno.fondoInicialEfectivoUSD
        : metodo === METODO_EFECTIVO_BS
          ? turno.fondoInicialEfectivoBs
          : 0;

    return {
      metodo,
      enBs,
      totalPagos,
      totalEgresos,
      montoEsperado: fondoInicial + totalPagos - totalEgresos,
      totalPagosUSD,
      totalEgresosUSD,
    };
  });

  return { turno, pagos, egresos, lineas };
}
