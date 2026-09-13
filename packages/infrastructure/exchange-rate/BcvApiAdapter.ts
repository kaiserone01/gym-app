import type { IExchangeRateService, TasaExterna } from "@gym-app/domain/ports/IExchangeRateService";

const URL_DOLARAPI_OFICIAL = "https://ve.dolarapi.com/v1/dolares/oficial";

interface RespuestaDolarApi {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

export class BcvApiAdapter implements IExchangeRateService {
  async obtenerTasaOficial(): Promise<TasaExterna> {
    const respuesta = await fetch(URL_DOLARAPI_OFICIAL);

    if (!respuesta.ok) {
      throw new Error(`dolarapi.com respondió ${respuesta.status}`);
    }

    const datos = (await respuesta.json()) as RespuestaDolarApi;

    if (typeof datos.promedio !== "number") {
      throw new Error("dolarapi.com no devolvió un campo 'promedio' numérico.");
    }

    return {
      valor: datos.promedio,
      fecha: new Date(datos.fechaActualizacion),
    };
  }
}
