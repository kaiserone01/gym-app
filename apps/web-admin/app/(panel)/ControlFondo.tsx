"use client";

import { useEffect, useRef } from "react";

const CLAVE = "gx-fondo-panel";
const VISIBILIDAD_INICIAL = 46;

// El velo oscuro sobre la foto va de 0.96 (foto casi invisible) a 0.70 (foto bien visible).
// La variable --velo-panel la lee el <main> del layout del panel.
function aplicar(visibilidad: number) {
  document.documentElement.style.setProperty("--velo-panel", String(0.96 - (visibilidad * 0.26) / 100));
}

export function ControlFondo() {
  // Campo no controlado: el valor guardado se aplica al montar sin re-renderizar.
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let guardada = VISIBILIDAD_INICIAL;
    try {
      const texto = localStorage.getItem(CLAVE);
      if (texto !== null && Number.isFinite(Number(texto))) guardada = Math.min(100, Math.max(0, Number(texto)));
    } catch {
      // Sin almacenamiento disponible: se usa la intensidad por defecto.
    }
    if (campo.current) campo.current.value = String(guardada);
    aplicar(guardada);
  }, []);

  function cambiar(valor: number) {
    aplicar(valor);
    try {
      localStorage.setItem(CLAVE, String(valor));
    } catch {
      // Sin almacenamiento disponible: el ajuste dura solo hasta recargar.
    }
  }

  return (
    <label className="mt-3 flex flex-col gap-1.5 px-1 text-xs font-semibold uppercase tracking-widest print:hidden" style={{ color: "var(--gx-muted)" }}>
      Fondo
      <input
        type="range"
        min={0}
        max={100}
        ref={campo}
        defaultValue={VISIBILIDAD_INICIAL}
        onChange={(e) => cambiar(Number(e.target.value))}
        aria-label="Visibilidad de la foto de fondo"
        className="w-full cursor-pointer"
        style={{ accentColor: "var(--gx-accent)" }}
      />
      <span className="flex justify-between text-[10px] normal-case tracking-normal" style={{ color: "var(--gx-muted-dim)" }}>
        <span>Tenue</span>
        <span>Visible</span>
      </span>
    </label>
  );
}
