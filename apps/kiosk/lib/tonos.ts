import type { Tono } from "./cara";

// El brillo usa rgba fijo (los mismos colores de temaAdrenalinaXtreme) porque el WebView del TV
// puede no soportar color-mix().
export const COLOR_TONO: Record<Tono, { color: string; tinta: string; brillo: string }> = {
  verde: { color: "var(--gx-accent)", tinta: "var(--gx-accent-ink)", brillo: "rgba(147, 232, 58, 0.4)" },
  ambar: { color: "var(--gx-warn)", tinta: "var(--gx-warn-ink)", brillo: "rgba(245, 166, 35, 0.4)" },
  rojo: { color: "var(--gx-bad)", tinta: "var(--gx-bad-ink)", brillo: "rgba(255, 59, 78, 0.4)" },
};

// Fondo de la ficha: con menos de 100 % de opacidad deja ver el video. rgba fijo (el `surface` de
// temaAdrenalinaXtreme, #12160d) por la misma razón que arriba: sin color-mix().
export function fondoFicha(opacidad?: number): string {
  if (opacidad === undefined || opacidad >= 100) return "var(--gx-surface)";
  return `rgba(18, 22, 13, ${opacidad / 100})`;
}
