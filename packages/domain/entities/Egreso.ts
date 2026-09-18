export type MonedaEgreso = "USD" | "BS";

export interface Egreso {
  id: string;
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
  registradoEn: Date;
}

export interface DatosNuevoEgreso {
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
}
