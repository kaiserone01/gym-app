import type { ReactNode } from "react";
import { fondoFicha } from "@/lib/tonos";

// Marco común de todas las caras: borde de color, franja con el logo y, si se pasa `duracionMs`,
// la barra de cuenta regresiva. El `key` del padre reinicia la barra en cada ficha nueva.
// `opacidadFondo` (0–100, defecto 100) deja ver el video detrás; solo la usa la ficha en reposo.
export function MarcoFicha({
  color,
  brillo,
  duracionMs,
  opacidadFondo,
  children,
}: {
  color: string;
  brillo?: string;
  duracionMs?: number;
  opacidadFondo?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden rounded-3xl border-4"
      style={{
        borderColor: color,
        background: fondoFicha(opacidadFondo),
        boxShadow: brillo ? `0 30px 70px -20px ${brillo}` : undefined,
      }}
    >
      <div
        className="flex items-center justify-center gap-4 px-8 py-2"
        style={{ borderBottom: "1px solid var(--gx-edge)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
        <img src="/branding/adrenalina-gym-bg.png" alt="" className="h-20 w-20 object-contain" />
        <span
          className="text-2xl font-bold uppercase"
          style={{ fontFamily: '"Barlow Condensed", sans-serif', letterSpacing: "0.3em", color: "var(--gx-muted)" }}
        >
          Adrenalina Xtreme Gym
        </span>
      </div>

      <div className="flex flex-1 flex-col">{children}</div>

      {duracionMs !== undefined && (
        <div className="h-2 w-full" style={{ background: "var(--gx-edge)" }}>
          <div className="barra-cuenta h-full" style={{ background: color, animationDuration: `${duracionMs}ms` }} />
        </div>
      )}
    </div>
  );
}
