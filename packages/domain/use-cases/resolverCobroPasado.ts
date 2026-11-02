import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { DatosLineaPago, MAX_DIAS_ATRAS_PAGO_FECHADO } from "../entities/Pago";
import { FechaPagoInvalidaError, SinTasaParaFechaError } from "./RegistrarPago";

export interface CobroPasado {
  fecha: Date;
  // Tasa BCV de ese día (la más cercana anterior); null si ninguna línea es en Bs.
  tasaDelDia: number | null;
}

// Un cobro que ya se hizo en un día pasado y no se anotó (hasta MAX_DIAS_ATRAS_PAGO_FECHADO): queda fuera de turno y
// los Bs usan la tasa BCV de ese día. Devuelve null si la fecha falta o es de hoy (cobro normal).
export async function resolverCobroPasado(
  tasas: ITasaCambioRepository | undefined,
  fecha: Date | undefined,
  lineas: DatosLineaPago[]
): Promise<CobroPasado | null> {
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  if (!fecha || fecha >= inicioDeHoy) return null;

  const limite = new Date();
  limite.setDate(limite.getDate() - MAX_DIAS_ATRAS_PAGO_FECHADO);
  if (fecha < limite) throw new FechaPagoInvalidaError(MAX_DIAS_ATRAS_PAGO_FECHADO);

  let tasaDelDia: number | null = null;
  if (lineas.some((linea) => linea.tasaCambio !== null)) {
    const tasa = await tasas?.buscarMasCercanaAnterior(fecha);
    if (!tasa) throw new SinTasaParaFechaError();
    tasaDelDia = tasa.valor;
  }
  return { fecha, tasaDelDia };
}

// Tasa que se guarda en una línea: la del día en un cobro pasado (si la línea es en Bs), la del formulario si no.
export function tasaDeLinea(linea: DatosLineaPago, pasado: CobroPasado | null): number | null {
  return pasado ? (linea.tasaCambio !== null ? pasado.tasaDelDia : null) : linea.tasaCambio;
}
