// AL_DIA: la última tasa guardada tiene fecha valor >= hoy. DESACTUALIZADA: fecha valor < hoy (casi seguro
// hay una publicación posterior sin sincronizar). Criterio del negocio (2026-09-26); lo comparten
// ObtenerTasaVigente y la vitrina para decidir si muestra el equivalente en Bs.
export type EstadoTasa = "AL_DIA" | "DESACTUALIZADA";

export function estadoDeTasa(fechaTasa: Date, hoy: Date): EstadoTasa {
  return fechaTasa < hoy ? "DESACTUALIZADA" : "AL_DIA";
}
