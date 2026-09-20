export type TipoMetodoPago = "EFECTIVO" | "PAGO_MOVIL" | "TRANSFERENCIA" | "PUNTO_VENTA" | "BIOPAGO" | "CRIPTO";

export type MonedaMetodoPago = "USD" | "BS";

// Tipos que operan en bolívares y por lo tanto requieren tasa de cambio
// BCV al momento de registrar un pago con ellos (ver ObtenerTasaActual).
export const TIPOS_QUE_PUEDEN_SER_EN_BS: TipoMetodoPago[] = ["EFECTIVO", "PAGO_MOVIL", "TRANSFERENCIA", "PUNTO_VENTA", "BIOPAGO"];

export interface MetodoPago {
  id: string;
  organizacionId: string;
  tipo: TipoMetodoPago;
  nombreBanco: string | null;
  logoUrl: string | null;
  moneda: MonedaMetodoPago;
  activo: boolean;
  orden: number;
  codigoBanco: string | null;
  telefono: string | null;
  rif: string | null;
  numeroCuenta: string | null;
  beneficiario: string | null;
  qrUrl: string | null;
  walletDireccion: string | null;
  walletUsuario: string | null;
  createdAt: Date;
}

export interface DatosNuevoMetodoPago {
  organizacionId: string;
  tipo: TipoMetodoPago;
  nombreBanco: string | null;
  logoUrl: string | null;
  moneda: MonedaMetodoPago;
  orden?: number;
  codigoBanco?: string | null;
  telefono?: string | null;
  rif?: string | null;
  numeroCuenta?: string | null;
  beneficiario?: string | null;
  qrUrl?: string | null;
  walletDireccion?: string | null;
  walletUsuario?: string | null;
}

export interface CambiosMetodoPago {
  nombreBanco?: string | null;
  logoUrl?: string | null;
  moneda?: MonedaMetodoPago;
  activo?: boolean;
  orden?: number;
  codigoBanco?: string | null;
  telefono?: string | null;
  rif?: string | null;
  numeroCuenta?: string | null;
  beneficiario?: string | null;
  qrUrl?: string | null;
  walletDireccion?: string | null;
  walletUsuario?: string | null;
}
