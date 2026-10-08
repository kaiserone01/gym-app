"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { webViewObsoleto } from "@/lib/versionWebView";

const sinSuscripcion = () => () => {};
const esObsoleto = () => webViewObsoleto(navigator.userAgent);
const nuncaEnServidor = () => false;

// Si el WebView del TV es demasiado viejo para el CSS del kiosco, en vez de una pantalla rota se muestra
// cómo arreglarlo. Estilos en línea: este aviso debe verse justo cuando el CSS de Tailwind NO funciona.
export function GuardaWebView({ children }: { children: ReactNode }) {
  const obsoleto = useSyncExternalStore(sinSuscripcion, esObsoleto, nuncaEnServidor);
  if (!obsoleto) return <>{children}</>;

  return (
    <main
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px",
        textAlign: "center",
        background: "#0a0d07",
        color: "#f3f6ec",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "48px", margin: "0 0 24px 0" }}>Actualiza el WebView del sistema</h1>
      <p style={{ fontSize: "28px", margin: 0, maxWidth: "900px", lineHeight: 1.4 }}>
        Este televisor tiene una versión antigua de «Android System WebView». Ábrela en Google Play, actualízala y
        vuelve a abrir el kiosco.
      </p>
    </main>
  );
}
