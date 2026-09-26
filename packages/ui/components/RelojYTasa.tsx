"use client";

import { useEffect, useState } from "react";

// Refresco perezoso (Etapa 2 del plan de tasa BCV): cada petición a
// /api/tasa-cambio dispara también la verificación en el servidor (ver
// apps/web-admin/lib/tasaBcv.ts). Se repite cada 45 min mientras la pestaña
// esté visible, y también al volver a foco — así una cajera con la pestaña
// abierta todo el turno igual ve la tasa nueva sin recargar la página.
const INTERVALO_REFRESCO_MS = 45 * 60_000;

interface TasaCambioRespuesta {
  valor: number;
  fuente: string;
}

// Reloj en vivo (hora del navegador del operador) + última tasa BCV
// guardada — visible en una esquina de todo el panel administrativo. La
// hora "real" que usa el sistema para abrir/cerrar turno la fija el
// servidor vía TZ=America/Caracas (ver Task 1 del plan); este reloj es
// solo informativo para quien opera la caja.
// onClickTasa (opcional): abre el historial de tasas al pulsar el texto de
// la tasa — ver ModalHistorialTasas/RelojYTasaConHistorial en apps/web-admin.
export function RelojYTasa({ onClickTasa }: { onClickTasa?: () => void }) {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [tasa, setTasa] = useState<TasaCambioRespuesta | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const intervalo = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    let cancelado = false;

    function cargarTasa() {
      fetch("/api/tasa-cambio")
        .then((res) => (res.ok ? res.json() : null))
        .then((datos: TasaCambioRespuesta | null) => {
          if (!cancelado && datos) setTasa(datos);
        })
        .catch(() => {
          // Sin tasa disponible o error de red — el bloque de tasa simplemente no se muestra.
        });
    }

    cargarTasa();
    const intervalo = setInterval(cargarTasa, INTERVALO_REFRESCO_MS);

    function alVolverAFoco() {
      if (document.visibilityState === "visible") cargarTasa();
    }
    document.addEventListener("visibilitychange", alVolverAFoco);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolverAFoco);
    };
  }, []);

  // Antes del primer render en el cliente `ahora` es null (evita mismatch
  // de hidratación: el servidor no puede saber la hora "del momento en
  // que el cliente ve la pantalla").
  if (!ahora) return null;

  return (
    <div
      className="fixed right-4 top-4 z-40 flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-medium shadow-sm print:hidden"
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
    >
      <span>{ahora.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "medium" })}</span>
      {tasa && (
        <>
          <span style={{ color: "var(--gx-edge)" }}>|</span>
          <button
            type="button"
            onClick={onClickTasa}
            className="cursor-pointer transition-opacity duration-150 hover:opacity-70"
            style={{ color: "var(--gx-accent)" }}
          >
            Bs. {tasa.valor.toFixed(2)} (BCV)
          </button>
        </>
      )}
    </div>
  );
}
