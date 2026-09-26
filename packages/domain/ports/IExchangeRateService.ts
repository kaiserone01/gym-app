export interface TasaExterna {
  valor: number;
  // Fecha valor publicada por el BCV (medianoche UTC).
  fecha: Date;
}

export type ResultadoPublicadas =
  | { tipo: "SIN_CAMBIOS" }
  | { tipo: "CAMBIOS"; version: string | null; tasas: TasaExterna[] };

export interface IExchangeRateService {
  // versionConocida = última versión (ETag) persistida con éxito; null = forzar descarga completa.
  obtenerPublicadas(versionConocida: string | null): Promise<ResultadoPublicadas>;
}
