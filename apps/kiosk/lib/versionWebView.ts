// Tailwind v4 (el CSS del kiosco) necesita Chromium 111 o más nuevo; un WebView viejo descarta el CSS
// dentro de @layer y la pantalla se vería sin maquetar.
export const CHROMIUM_MINIMO = 111;

export function versionChromium(userAgent: string): number | null {
  const coincidencia = /Chrome\/(\d+)/.exec(userAgent);
  return coincidencia ? Number(coincidencia[1]) : null;
}

// Si no se puede leer la versión (otros motores) no se avisa: solo se avisa con certeza.
export function webViewObsoleto(userAgent: string, minimo: number = CHROMIUM_MINIMO): boolean {
  const version = versionChromium(userAgent);
  return version !== null && version < minimo;
}
