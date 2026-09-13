import { IExchangeRateService } from "../ports/IExchangeRateService";
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("La API del BCV falló y no hay ninguna tasa previa guardada para usar como fallback.");
  }
}

export interface ActualizarTasaDiariaDeps {
  servicioTasa: IExchangeRateService;
  tasas: ITasaCambioRepository;
}

export interface ResultadoActualizarTasaDiaria {
  tasa: TasaCambio;
  fuenteReal: "BCV" | "ULTIMA_GUARDADA";
}

export async function actualizarTasaDiaria(deps: ActualizarTasaDiariaDeps): Promise<ResultadoActualizarTasaDiaria> {
  try {
    const externa = await deps.servicioTasa.obtenerTasaOficial();
    const tasa = await deps.tasas.guardar(externa.fecha, externa.valor, "BCV");
    return { tasa, fuenteReal: "BCV" };
  } catch {
    const ultima = await deps.tasas.obtenerUltima();

    if (!ultima) {
      throw new SinTasaDisponibleError();
    }

    return { tasa: ultima, fuenteReal: "ULTIMA_GUARDADA" };
  }
}
