export interface ArqueoLinea {
  id: string;
  turnoId: string;
  metodo: string;
  montoEsperado: number;
  montoContado: number;
  diferencia: number;
  nota: string | null;
}

export interface DatosNuevaArqueoLinea {
  turnoId: string;
  metodo: string;
  montoEsperado: number;
  montoContado: number;
  diferencia: number;
  nota: string | null;
}
