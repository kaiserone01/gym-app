"use client";

import { useEffect, useState } from "react";

export function Sheet({
  abierto,
  onCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  // Monta el sheet cerrado primero para poder animar la entrada (translateY)
  // en vez de aparecer de golpe.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (abierto) {
      const cuadro = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(cuadro);
    }
    setVisible(false);
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden">
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ background: "var(--gx-scrim)" }}
        onClick={onCerrar}
      />
      <div
        className={`relative flex max-h-[85vh] w-full flex-col rounded-t-3xl transition-transform ${
          visible ? "translate-y-0 duration-200 ease-out" : "translate-y-full duration-150 ease-in"
        }`}
        style={{ background: "var(--gx-surface-elevada)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full" style={{ background: "var(--gx-edge)" }} />
        </div>

        {titulo && (
          <div className="flex items-center justify-between px-5 pt-3">
            <h2 className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
              {titulo}
            </h2>
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-11 min-w-11 rounded-lg text-sm font-medium"
              style={{ color: "var(--gx-muted)" }}
              aria-label="Cerrar"
            >
              Cerrar
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
