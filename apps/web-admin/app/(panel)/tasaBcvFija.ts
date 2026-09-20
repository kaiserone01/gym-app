// Tasa fija solo para pruebas — cuando conectemos estos formularios a
// /api/tasa-cambio (ya alimentada por apps/worker con la tasa BCV real),
// esto se reemplaza por ese valor en vivo.
export const TASA_BCV_FIJA = 850;
export const METODOS_EN_BS = [
  "efectivo_bs",
  "pago_movil",
  "transferencia_bdv",
  "transferencia_mercantil",
  "punto_banesco",
  "biopago",
  "punto_tesoro",
  "transferencia",
];

export function formatearBs(monto: number): string {
  return monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "Bs. 6.659,91 (REF $8.00)" — cada canal de pago opera nominativamente en
// su propia moneda, pero la equivalencia en USD (según la tasa vigente al
// momento de la transacción, no la tasa actual) es útil para comparar y
// cuadrar. Se usa en todo lugar que muestre un monto en Bs con su
// referencia ya conocida (Caja, Histórico de Pagos, Arqueo). Si aún no hay
// referencia (montoUSD null — egresos previos a este cambio, o tasa no
// disponible), se omite el paréntesis en vez de mostrar "$NaN".
export function formatearBsConRef(montoBs: number, montoRefUSD: number | null): string {
  const base = `Bs. ${formatearBs(montoBs)}`;
  if (montoRefUSD === null || Number.isNaN(montoRefUSD)) return base;
  return `${base} (REF $${montoRefUSD.toFixed(2)})`;
}
