export function formatearBs(monto: number): string {
  return monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
