export type EstadoDeuda = "PENDIENTE" | "COBRADA" | "ANULADA";

export interface DeudaProducto {
  id: string;
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  // Solo lo resuelven los listados que hacen join con Miembro.
  miembroNombre?: string;
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: number;
  estado: EstadoDeuda;
  registradaPorId: string;
  creadaEn: Date;
  cobradaEn: Date | null;
  grupoPagoId: string | null;
}

export interface DatosNuevaDeuda {
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: number;
  registradaPorId: string;
}

// Única fuente de verdad del total de un conjunto de deudas (la usan el
// servidor al cobrar y la UI para mostrarlo).
export function totalDeudas(deudas: Pick<DeudaProducto, "precioUnitarioUSD" | "cantidad">[]): number {
  const centavos = deudas.reduce((suma, d) => suma + Math.round(d.precioUnitarioUSD * d.cantidad * 100), 0);
  return centavos / 100;
}

// Texto que queda como concepto del Pago al cobrar: "Agua × 2, Gatorade".
export function conceptoDeudas(deudas: Pick<DeudaProducto, "productoNombre" | "cantidad">[]): string {
  return deudas.map((d) => (d.cantidad > 1 ? `${d.productoNombre} × ${d.cantidad}` : d.productoNombre)).join(", ");
}
