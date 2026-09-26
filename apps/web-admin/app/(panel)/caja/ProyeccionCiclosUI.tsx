"use client";

// Componentes de presentación puros para la proyección de ciclos y el
// mensaje de abono — separados de ModalRegistrarPagoCaja.tsx y
// PanelRemanentePago.tsx específicamente para que ambos puedan importarlos
// sin crear una dependencia circular entre esos dos archivos (Panel usa
// estos componentes, y Modal usa Panel).
import { formatearBs } from "../tasaBcvFija";
import type { CicloProyectado } from "@gym-app/domain/entities/ReglaAbono";
import type { ProyeccionAbono } from "./proyeccionAbono";

export function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Lista de ciclos que cubre un pago, sin límite de cantidad (ver diseño
// acordado) — el tramo ya vigente antes de este pago se marca en un color
// distinto (acento suave) del resto, que son ciclos NUEVOS que este pago
// agrega (acento fuerte) o el remanente parcial final (mutado, sin
// completar un ciclo). Se usa igual en Total, Abono y Fraccionado.
export function DetalleCiclosPago({ ciclos }: { ciclos: CicloProyectado[] }) {
  if (ciclos.length < 2) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--gx-edge)" }}>
      <p className="mb-1 font-medium" style={{ color: "var(--gx-muted)" }}>
        Detalle de ciclos que cubre este pago
      </p>
      {(() => {
        let numeroCiclo = 0;
        return ciclos.map((ciclo, indice) => {
          if (ciclo.tipo !== "vigente") numeroCiclo++;
          return (
            <div
              key={indice}
              className="flex items-center justify-between rounded-md px-2 py-1"
              style={
                ciclo.tipo === "vigente"
                  ? { background: "color-mix(in srgb, var(--gx-muted) 12%, transparent)" }
                  : { background: "color-mix(in srgb, var(--gx-accent) 10%, transparent)" }
              }
            >
              <span style={{ color: "var(--gx-ink)" }}>
                {ciclo.tipo === "vigente"
                  ? "Ya vigente"
                  : ciclo.tipo === "parcial"
                    ? `Ciclo ${numeroCiclo} parcial (${ciclo.porcentajeCubierto.toFixed(0)}%)`
                    : `Ciclo ${numeroCiclo}`}
              </span>
              <span style={{ color: "var(--gx-muted)" }}>
                {formatearFechaCorta(ciclo.inicio)} – {formatearFechaCorta(ciclo.fin)}
              </span>
            </div>
          );
        });
      })()}
    </div>
  );
}

// Mensaje completo de proyección (monto abonado, saldo remanente + fecha
// destacados, % recibido) — mismo texto en Abono y en el panel flotante de
// Fraccionado (ver diseño acordado). Devuelve null si no hay nada que
// proyectar.
export function MensajeProyeccionAbono({
  proyeccionAbono,
  montoSugerido,
  montoObjetivo,
  tasaActual,
}: {
  proyeccionAbono: ProyeccionAbono;
  montoSugerido: number;
  montoObjetivo: number;
  tasaActual: number | null;
}) {
  if (montoObjetivo <= 0) return null;

  return (
    <p className="text-sm" style={{ color: proyeccionAbono.cumpleMinimo ? "var(--gx-muted)" : "var(--gx-bad)" }}>
      {proyeccionAbono.cumpleMinimo ? (
        proyeccionAbono.fechaTope ? (
          <>
            {proyeccionAbono.esAdelantoCicloSiguiente ? (
              <>Este pago salda el ciclo actual y adelanta el próximo — </>
            ) : (
              <>
                Es menos que el precio del plan (${montoSugerido.toFixed(2)}) — abonó ${montoObjetivo.toFixed(2)}
                {tasaActual !== null && ` (Bs. ${formatearBs(montoObjetivo * tasaActual)})`}.{" "}
              </>
            )}
            Tiene que cancelar el{" "}
            <strong style={{ color: "var(--gx-accent)" }}>
              saldo remanente de ${proyeccionAbono.saldoRemanente.toFixed(2)}
              {tasaActual !== null && ` (Bs. ${formatearBs(proyeccionAbono.saldoRemanente * tasaActual)})`} antes del{" "}
              {proyeccionAbono.fechaTope.toLocaleDateString("es-VE")}
            </strong>
            . Pago parcial: {proyeccionAbono.porcentajeCubierto.toFixed(0)}% recibido
            {proyeccionAbono.esAdelantoCicloSiguiente ? " del próximo ciclo" : ""} (cubre{" "}
            {proyeccionAbono.diasCubiertos} día(s) {proyeccionAbono.esAdelantoCicloSiguiente ? "del próximo ciclo" : "del ciclo"}
            ).
          </>
        ) : (
          proyeccionAbono.esAdelantoCicloSiguiente
            ? "Este pago cubre el ciclo actual y el próximo ciclo completo."
            : "Este monto cubre el plan completo."
        )
      ) : (
        `El abono mínimo para este plan es $${proyeccionAbono.montoMinimo.toFixed(2)}.`
      )}
    </p>
  );
}
