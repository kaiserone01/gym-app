import type { IExchangeRateService, ResultadoPublicadas, TasaExterna } from "@gym-app/domain/ports/IExchangeRateService";

const URL_DOLARAPI_HISTORICOS = "https://ve.dolarapi.com/v1/historicos/dolares/oficial";
const TIMEOUT_MS = 5000;

interface FilaHistoricoDolarApi {
  fuente?: string;
  compra?: number | null;
  venta?: number | null;
  promedio?: unknown;
  fecha?: unknown;
}

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function mapearFila(fila: FilaHistoricoDolarApi): TasaExterna | null {
  const fecha = fila.fecha;
  const promedio = fila.promedio;

  if (typeof fecha !== "string" || !FORMATO_FECHA.test(fecha)) return null;
  if (typeof promedio !== "number" || !Number.isFinite(promedio) || promedio <= 0) return null;

  return { valor: promedio, fecha: new Date(`${fecha}T00:00:00Z`) };
}

export class BcvApiAdapter implements IExchangeRateService {
  // Stateless: no guarda el ETag entre llamadas — eso vive en el orquestador (apps/web-admin/lib).
  async obtenerPublicadas(versionConocida: string | null): Promise<ResultadoPublicadas> {
    const headers: Record<string, string> = {};
    if (versionConocida) headers["If-None-Match"] = versionConocida;

    const respuesta = await fetch(URL_DOLARAPI_HISTORICOS, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (respuesta.status === 304) {
      return { tipo: "SIN_CAMBIOS" };
    }

    if (!respuesta.ok) {
      throw new Error(`dolarapi.com respondió ${respuesta.status}`);
    }

    const datos = await respuesta.json();

    if (!Array.isArray(datos)) {
      throw new Error("dolarapi.com no devolvió un array de históricos.");
    }

    const tasas = (datos as FilaHistoricoDolarApi[])
      .map(mapearFila)
      .filter((t): t is TasaExterna => t !== null);

    const version = respuesta.headers.get("etag");

    return { tipo: "CAMBIOS", version, tasas };
  }
}
