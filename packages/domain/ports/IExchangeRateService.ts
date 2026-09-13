export interface TasaExterna {
  valor: number;
  // Día calendario al que corresponde la tasa, según lo informa la fuente
  // (no necesariamente "hoy" — ej. fin de semana, el BCV no publica).
  fecha: Date;
}

export interface IExchangeRateService {
  obtenerTasaOficial(): Promise<TasaExterna>;
}
