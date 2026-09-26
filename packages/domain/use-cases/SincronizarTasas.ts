import type { IExchangeRateService } from "../ports/IExchangeRateService";
import type { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { sumarDias } from "../utils/fechaCaracas";

const DIAS_VENTANA_RECONCILIACION = 7;
const DIAS_VENTANA_TABLA_VACIA = 60;

export interface SincronizarTasasInput {
  versionConocida: string | null;
  hoy: Date;
}

export interface ResultadoSincronizarTasas {
  estado: "SIN_CAMBIOS" | "ACTUALIZADO";
  guardadas: number;
  version: string | null;
}

export async function sincronizarTasas(
  deps: { servicioTasa: IExchangeRateService; tasas: ITasaCambioRepository },
  input: SincronizarTasasInput
): Promise<ResultadoSincronizarTasas> {
  const resultado = await deps.servicioTasa.obtenerPublicadas(input.versionConocida);

  if (resultado.tipo === "SIN_CAMBIOS") {
    return { estado: "SIN_CAMBIOS", guardadas: 0, version: input.versionConocida };
  }

  const ultima = await deps.tasas.obtenerUltima();
  const inicioVentana = ultima
    ? sumarDias(ultima.fecha, -DIAS_VENTANA_RECONCILIACION)
    : sumarDias(input.hoy, -DIAS_VENTANA_TABLA_VACIA);

  const filtradas = resultado.tasas.filter(
    (t) => Number.isFinite(t.valor) && t.valor > 0 && t.fecha >= inicioVentana
  );

  const guardadas = await deps.tasas.guardarVarias(filtradas, "BCV");

  return { estado: "ACTUALIZADO", guardadas, version: resultado.version };
}
