import type { ResultadoCheckIn } from "@/lib/api";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

export function AccessCard({ resultado, hora }: { resultado: ResultadoCheckIn; hora: string }) {
  const activo = resultado.estado === "activo";
  const colorEstado = activo ? "var(--gx-accent)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : "var(--gx-bad-ink)";

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}>
      <div
        className="flex items-center justify-between px-8 py-4 text-2xl"
        style={{ background: colorEstado, color: colorEstadoInk, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <span>{activo ? "✓ Acceso permitido" : "✕ Membresía vencida"}</span>
        <span className="text-sm font-semibold" style={{ fontFamily: '"Barlow", sans-serif' }}>{hora}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-8 p-8">
        <div
          className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full text-3xl"
          style={{ fontFamily: '"Bebas Neue", sans-serif', color: colorEstado, background: "var(--gx-surface-2)", border: `3px solid ${colorEstado}` }}
        >
          {resultado.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image
            <img src={resultado.fotoUrl} alt={resultado.nombre} className="h-full w-full object-cover" />
          ) : (
            iniciales(resultado.nombre)
          )}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-4xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            {resultado.nombre}
          </p>

          <div className="grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Entrada
              </span>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>{hora}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Entrenador
              </span>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>{resultado.entrenador ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
