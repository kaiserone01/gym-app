export interface CierreCaja {
  id: string;
  organizacionId: string;
  fecha: Date;
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
  cerradoEn: Date;
}

export interface DatosNuevoCierreCaja {
  organizacionId: string;
  fecha: Date;
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
}
