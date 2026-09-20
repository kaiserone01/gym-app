import { CheckCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { ResultadoCheckIn } from "@/lib/api";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

const ETIQUETA_ESTADO: Record<ResultadoCheckIn["estado"], string> = {
  activo: "Acceso permitido",
  vencido: "Membresía vencida",
  sucursal_incorrecta: "Acceso denegado",
};

export function AccessCard({ resultado, hora }: { resultado: ResultadoCheckIn; hora: string }) {
  const activo = resultado.estado === "activo";
  const colorEstado = activo ? "var(--gx-accent)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : "var(--gx-bad-ink)";

  return (
    <div
      className="w-full max-w-3xl overflow-hidden rounded-3xl border-2"
      style={{
        borderColor: colorEstado,
        background: "var(--gx-surface)",
        boxShadow: `0 30px 70px -20px color-mix(in srgb, ${colorEstado} 40%, transparent)`,
      }}
    >
      <div
        className="flex items-center justify-center gap-3 px-8 py-3"
        style={{ borderBottom: "1px solid var(--gx-edge)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
        <img src="/branding/logo-adrenalina-gym.jpg" alt="" className="h-8 w-8 rounded-full object-cover" />
        <span
          className="text-sm font-bold uppercase"
          style={{ fontFamily: '"Barlow Condensed", sans-serif', letterSpacing: "0.3em", color: "var(--gx-muted)" }}
        >
          Adrenalina Xtreme Gym
        </span>
      </div>

      <div
        className="flex items-center justify-between px-8 py-5 text-3xl"
        style={{ background: colorEstado, color: colorEstadoInk, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <span className="flex items-center gap-2">
          {activo ? <CheckCircle size={32} weight="fill" /> : <XCircle size={32} weight="fill" />}
          {ETIQUETA_ESTADO[resultado.estado]}
        </span>
        <span className="text-base font-semibold" style={{ fontFamily: '"Barlow", sans-serif' }}>{hora}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-10 p-10">
        <div className="relative h-40 w-40">
          <div
            className="absolute rounded-full opacity-40 blur-md"
            style={{ inset: -16, background: `radial-gradient(circle, ${colorEstado} 0%, transparent 70%)` }}
          />
          <div
            className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full text-4xl"
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              color: colorEstado,
              background: "var(--gx-surface-2)",
              border: `4px solid ${colorEstado}`,
            }}
          >
            {resultado.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image
              <img src={resultado.fotoUrl} alt={resultado.nombre} className="h-full w-full object-cover" />
            ) : (
              iniciales(resultado.nombre)
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <p className="text-5xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            {resultado.nombre}
          </p>

          {resultado.estado === "sucursal_incorrecta" ? (
            <div className="border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Tu sede asignada es
              </span>
              <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                {resultado.sucursalAsignadaNombre}
              </p>
              {resultado.sucursalAsignadaDireccion && (
                <p className="text-base" style={{ color: "var(--gx-muted)" }}>
                  {resultado.sucursalAsignadaDireccion}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                  Entrada
                </span>
                <span className="text-xl font-semibold" style={{ color: "var(--gx-ink)" }}>{hora}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                  Entrenador
                </span>
                <span className="text-xl font-semibold" style={{ color: "var(--gx-ink)" }}>{resultado.entrenador ?? "—"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
