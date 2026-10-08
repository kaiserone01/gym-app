import type { Tono } from "./cara";

// El brillo usa rgba fijo (los mismos colores de temaAdrenalinaXtreme) porque el WebView del TV
// puede no soportar color-mix().
export const COLOR_TONO: Record<Tono, { color: string; tinta: string; brillo: string }> = {
  verde: { color: "var(--gx-accent)", tinta: "var(--gx-accent-ink)", brillo: "rgba(147, 232, 58, 0.4)" },
  ambar: { color: "var(--gx-warn)", tinta: "var(--gx-warn-ink)", brillo: "rgba(245, 166, 35, 0.4)" },
  rojo: { color: "var(--gx-bad)", tinta: "var(--gx-bad-ink)", brillo: "rgba(255, 59, 78, 0.4)" },
};
