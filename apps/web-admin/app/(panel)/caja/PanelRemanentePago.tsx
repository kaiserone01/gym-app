"use client";

import { DetalleCiclosPago, MensajeProyeccionAbono } from "./ProyeccionCiclosUI";
import type { ProyeccionAbono } from "./proyeccionAbono";

interface LineaMostrada {
  metodo: string;
  monto: number;
}

export function PanelRemanentePago({
  lineas,
  montoObjetivo,
  tasaReferencia,
  proyeccion,
  modalidad,
}: {
  lineas: LineaMostrada[];
  montoObjetivo: number;
  // Tasa Bs/USD a usar para la conversión del remanente — se toma de la
  // primera línea que ya tenga una tasa elegida, o null si ninguna la
  // tiene todavía (en ese caso solo se muestra el remanente en USD).
  tasaReferencia: number | null;
  // Proyección + detalle de períodos que cubre el pago, calculada sobre la
  // suma de fracciones ya cargadas — siempre visible mientras exista (ver
  // diseño acordado: "que el cliente vea que cubre su pago"), arriba del
  // título "Canal de pago". null mientras no hay nada cargado todavía.
  proyeccion: ProyeccionAbono | null;
  // Determina el copy del mensaje y el título de la lista (ver diseño
  // acordado: en Total/Abono no se "distribuye" nada, es un solo canal).
  modalidad: "total" | "abono" | "combinado";
}) {
  const sumaLineas = lineas.reduce((suma, l) => suma + l.monto, 0);
  // Comparación simple y directa contra el precio del plan — nunca contra
  // proyeccion.saldoRemanente, que en Abono puede referirse al PRÓXIMO
  // período (un abono que adelanta ciclo siguiente es válido ahí). En
  // Total/Fraccionado la intención siempre es pagar el período actual
  // completo ahora mismo, así que lo único relevante es cuánto falta o
  // sobra respecto al monto de ESTE pago.
  const remanente = Math.max(0, montoObjetivo - sumaLineas);
  const excedente = Math.max(0, sumaLineas - montoObjetivo);
  // En Abono, un excedente puede ser un adelanto intencional del próximo
  // período (ver mensaje "Adelanta el próximo período..."), así que no se
  // marca como "excedente a favor" salvo que sobre más de lo que ese
  // adelanto llega a cubrir.
  const excedenteEsAdelantoValido =
    modalidad === "abono" && proyeccion !== null && proyeccion.esAdelantoCicloSiguiente && proyeccion.saldoRemanente > 0;

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] w-72 rounded-xl border-2 p-4 shadow-2xl"
      style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
    >
      {proyeccion && (
        <div className="mb-3 flex flex-col gap-2 border-b pb-3" style={{ borderColor: "var(--gx-edge)" }}>
          <MensajeProyeccionAbono
            proyeccionAbono={proyeccion}
            montoSugerido={montoObjetivo}
            montoObjetivo={sumaLineas}
            tasaActual={tasaReferencia}
            modalidad={modalidad}
          />
          {proyeccion.cumpleMinimo && <DetalleCiclosPago ciclos={proyeccion.ciclos} />}
        </div>
      )}

      <p className="text-xs font-semibold uppercase" style={{ color: "var(--gx-muted)" }}>
        {modalidad === "combinado" ? "Distribución del pago" : "Canal de pago"}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {lineas
          .filter((l) => l.monto > 0)
          .map((linea, indice) => (
            <div key={indice} className="flex justify-between text-sm">
              <span style={{ color: "var(--gx-muted)" }}>{linea.metodo || "Sin método"}</span>
              <span style={{ color: "var(--gx-ink)" }}>${linea.monto.toFixed(2)}</span>
            </div>
          ))}
      </div>
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
        {remanente > 0 ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
              {modalidad === "abono" ? `Próximo giro de $${remanente.toFixed(2)}` : `Falta $${remanente.toFixed(2)}`}
            </p>
            {tasaReferencia !== null && (
              <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                ≈ Bs. {(remanente * tasaReferencia).toFixed(2)}
              </p>
            )}
          </>
        ) : excedente > 0 && !excedenteEsAdelantoValido ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--gx-accent)" }}>
              Sobra ${excedente.toFixed(2)} — se excedió el monto
            </p>
            {tasaReferencia !== null && (
              <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                ≈ Bs. {(excedente * tasaReferencia).toFixed(2)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold" style={{ color: "var(--gx-accent)" }}>
            Monto completo
          </p>
        )}
      </div>
    </div>
  );
}
