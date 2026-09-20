export type MonedaEgreso = "USD" | "BS";

export interface Egreso {
  id: string;
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  // Tasa BCV vigente al momento de registrar el egreso — solo para
  // moneda "BS" (mismo mecanismo que Pago.tasaCambio/montoBs, ver
  // RegistrarPago). null para egresos en USD.
  tasaCambio: number | null;
  // Referencia en USD: para moneda "USD" es igual a `monto`; para "BS" es
  // `monto / tasaCambio`, calculado al registrar — permite comparar/sumar
  // egresos de distintas monedas en USD (ver ObtenerReporteCaja).
  montoUSD: number | null;
  metodo: string;
  motivo: string;
  registradoEn: Date;
}

export interface DatosNuevoEgreso {
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  tasaCambio: number | null;
  montoUSD: number | null;
  metodo: string;
  motivo: string;
}
