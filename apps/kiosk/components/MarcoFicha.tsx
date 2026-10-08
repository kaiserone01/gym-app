import type { ReactNode } from "react";

// Marco común de todas las caras: borde de color, franja con el logo y, si se pasa `duracionMs`,
// la barra de cuenta regresiva. El `key` del padre reinicia la barra en cada ficha nueva.
export function MarcoFicha({
  color,
  brillo,
  duracionMs,
  children,
}: {
  color: string;
  brillo?: string;
  duracionMs?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-3xl border-4"
      style={{
        borderColor: color,
        background: "var(--gx-surface)",
        boxShadow: brillo ? `0 30px 70px -20px ${brillo}` : undefined,
      }}
    >
      <div
        className="flex items-center justify-center gap-4 px-8 py-4"
        style={{ borderBottom: "1px solid var(--gx-edge)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
        <img src="/branding/logo-adrenalina-gym.jpg" alt="" className="h-12 w-12 rounded-full object-cover" />
        <span
          className="text-2xl font-bold uppercase"
          style={{ fontFamily: '"Barlow Condensed", sans-serif', letterSpacing: "0.3em", color: "var(--gx-muted)" }}
        >
          Adrenalina Xtreme Gym
        </span>
      </div>

      {children}

      {duracionMs !== undefined && (
        <div className="h-2 w-full" style={{ background: "var(--gx-edge)" }}>
          <div className="barra-cuenta h-full" style={{ background: color, animationDuration: `${duracionMs}ms` }} />
        </div>
      )}
    </div>
  );
}
