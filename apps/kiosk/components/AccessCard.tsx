import { CheckCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { ResultadoCheckIn } from "@/lib/api";
import { textoPorVencer, tonoDeCara, type CaraFicha } from "@/lib/cara";
import { FRASE_BIENVENIDA_NEUTRA } from "@/lib/frases";
import { nombreCorto } from "@/lib/nombreCorto";
import { COLOR_TONO } from "@/lib/tonos";
import { MarcoFicha } from "./MarcoFicha";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function formatearFecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

const ETIQUETA_CARA: Record<CaraFicha, string> = {
  permitido: "Acceso permitido",
  por_vencer: "Acceso permitido",
  en_gracia: "Membresía vencida — período de gracia",
  vencido: "Membresía vencida",
  abono_vencido: "Plazo de abono vencido",
  sucursal_incorrecta: "Acceso denegado",
};

// Caras con acceso: llevan el saludo.
const CARAS_CON_ACCESO: readonly CaraFicha[] = ["permitido", "por_vencer", "en_gracia"];

const ETIQUETA_DATO = "text-2xl font-bold uppercase";
const ESTILO_ETIQUETA = { letterSpacing: "0.1em", color: "var(--gx-muted-dim)" };

export function AccessCard({
  resultado,
  hora,
  cara,
  diasParaVencer,
  duracionMs,
}: {
  resultado: ResultadoCheckIn;
  hora: string;
  cara: CaraFicha;
  diasParaVencer: number | null;
  duracionMs?: number;
}) {
  const { color, tinta, brillo } = COLOR_TONO[tonoDeCara(cara)];
  const acceso = cara === "permitido" || cara === "por_vencer";
  const nombre = nombreCorto(resultado.nombre);

  return (
    <MarcoFicha color={color} brillo={brillo} duracionMs={duracionMs}>
      <div
        className="flex items-center justify-between gap-6 px-10 py-6 text-6xl"
        style={{ background: color, color: tinta, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <span className="flex items-center gap-3">
          {acceso ? <CheckCircle size={56} weight="fill" /> : <XCircle size={56} weight="fill" />}
          {ETIQUETA_CARA[cara]}
        </span>
        <span className="flex items-center gap-4">
          {cara === "por_vencer" && diasParaVencer !== null && (
            <span
              className="rounded-full px-5 py-1 text-3xl"
              style={{ background: "var(--gx-warn)", color: "var(--gx-warn-ink)", fontFamily: '"Barlow", sans-serif', fontWeight: 700 }}
            >
              {textoPorVencer(diasParaVencer)}
            </span>
          )}
          <span className="text-3xl font-semibold" style={{ fontFamily: '"Barlow", sans-serif' }}>
            {hora}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-12 p-12">
        <div
          className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-full text-7xl"
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            color,
            background: "var(--gx-surface-2)",
            border: `4px solid ${color}`,
          }}
        >
          {resultado.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image
            <img src={resultado.fotoUrl} alt={resultado.nombre} className="h-full w-full object-cover" />
          ) : (
            iniciales(resultado.nombre)
          )}
        </div>

        <div className="flex flex-col gap-6">
          {CARAS_CON_ACCESO.includes(cara) && (
            <p className="text-4xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color, letterSpacing: "0.02em" }}>
              {FRASE_BIENVENIDA_NEUTRA}
            </p>
          )}
          <p className="break-words text-8xl uppercase leading-none" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            {nombre}
          </p>

          {cara === "sucursal_incorrecta" ? (
            <div className="border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
              <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                Tu sede asignada es
              </span>
              <p className="mt-1 text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                {resultado.sucursalAsignadaNombre}
              </p>
              {resultado.sucursalAsignadaDireccion && (
                <p className="text-3xl" style={{ color: "var(--gx-muted)" }}>
                  {resultado.sucursalAsignadaDireccion}
                </p>
              )}
            </div>
          ) : (
            <>
              {(cara === "en_gracia" || cara === "vencido" || cara === "abono_vencido") && (
                <p className="border-t pt-6 text-3xl font-medium" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-warn)" }}>
                  {cara === "en_gracia"
                    ? `Tenés ${resultado.diasGraciaRestantes ?? 0} día(s) de gracia — acercate a recepción a renovar tu plan.`
                    : cara === "abono_vencido"
                      ? "Completa tu pago para reactivar el acceso — acércate a recepción."
                      : resultado.tieneGraciaConfigurada
                        ? "Tu período de gracia terminó — acercate a recepción a renovar tu plan."
                        : "Acercate a recepción a renovar tu plan."}
                </p>
              )}
              <div className="grid grid-cols-3 gap-6 border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Entrada
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    {hora}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Vence
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: acceso ? "var(--gx-ink)" : "var(--gx-warn)" }}>
                    {formatearFecha(resultado.fechaVencimiento)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Entrenador
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    {resultado.entrenador ?? "—"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </MarcoFicha>
  );
}
