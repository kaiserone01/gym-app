// Tasa fija solo para pruebas — cuando conectemos estos formularios a
// /api/tasa-cambio (ya alimentada por apps/worker con la tasa BCV real),
// esto se reemplaza por ese valor en vivo.
export const TASA_BCV_FIJA = 850;
export const METODOS_EN_BS = ["efectivo_bs", "pago_movil"];

export function formatearBs(monto: number): string {
  return monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
